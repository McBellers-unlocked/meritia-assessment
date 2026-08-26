import Anthropic from "@anthropic-ai/sdk";
import type { RecruitmentAssessment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAnthropicKey } from "@/lib/secrets";
import { RUNTIME_MODEL } from "./model-config";
import { getScenarioForAssessment } from "./scenario-loader";
import { isMemoAiTask } from "./types";
import {
  buildDefencePrompt,
  defenceDeadline,
  DEFENCE_QUESTION_TOOL,
  fallbackDefenceQuestions,
  normaliseDefenceQuestions,
  type DefenceQuestion,
} from "./defence";
import { CONTENT_VERSION, DEFENCE_PROMPT_VERSION } from "./prompt-versions";

type AssessmentSnapshot = Pick<
  RecruitmentAssessment,
  "scenarioId" | "customScenarioId" | "assessmentMode" | "modePolicyVersion" |
  "defenceEnabled" | "defenceQuestionCount" | "defenceMinutes"
>;

async function generateQuestions(candidateId: string, assessment: AssessmentSnapshot): Promise<{
  questions: DefenceQuestion[];
  personalised: boolean;
  model: string | null;
  error: string | null;
}> {
  try {
    const [scenario, responses, interactions, evidence] = await Promise.all([
      getScenarioForAssessment(assessment),
      prisma.recruitmentResponse.findMany({ where: { candidateId }, orderBy: { taskNumber: "asc" }, select: { taskNumber: true, content: true } }),
      prisma.recruitmentInteraction.findMany({ where: { candidateId }, orderBy: { sequenceNum: "asc" }, select: { taskNumber: true, actor: true, content: true } }),
      prisma.recruitmentCandidateEvidence.findMany({ where: { candidateId }, orderBy: { createdAt: "asc" }, select: { claim: true, sourceTitle: true, candidateDisposition: true } }),
    ]);
    if (!scenario) throw new Error("Scenario configuration is unavailable.");
    const exhibits = scenario.tasks.filter(isMemoAiTask).map((task) => ({
      taskNumber: task.number,
      title: task.exhibitTitle,
      text: task.exhibitHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 12_000),
    }));
    const payload = {
      scenario: { title: scenario.title, positionTitle: scenario.positionTitle },
      submissions: responses.map((item) => ({ taskNumber: item.taskNumber, content: item.content.slice(0, 20_000) })),
      knowledgeDialogue: interactions.map((item) => ({ taskNumber: item.taskNumber, actor: item.actor, content: item.content.slice(0, 3_000) })),
      evidenceActions: evidence,
      exhibits,
    };
    const anthropic = new Anthropic({ apiKey: await getAnthropicKey() });
    const response = await anthropic.messages.create(
      {
        model: RUNTIME_MODEL,
        max_tokens: 700,
        system: buildDefencePrompt(),
        tools: [DEFENCE_QUESTION_TOOL as unknown as Anthropic.Tool],
        tool_choice: { type: "tool", name: DEFENCE_QUESTION_TOOL.name },
        messages: [{ role: "user", content: JSON.stringify(payload) }],
      },
      { signal: AbortSignal.timeout(12_000) }
    );
    const tool = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === DEFENCE_QUESTION_TOOL.name);
    const raw = tool?.input && typeof tool.input === "object" ? (tool.input as Record<string, unknown>).questions : null;
    const questions = normaliseDefenceQuestions(raw);
    if (!questions) throw new Error("Model returned invalid defence questions.");
    return { questions, personalised: true, model: RUNTIME_MODEL, error: null };
  } catch (error) {
    return {
      questions: fallbackDefenceQuestions(),
      personalised: false,
      model: null,
      error: (error as Error).message.slice(0, 2_000),
    };
  }
}

export async function createCandidateDefence(
  candidateId: string,
  assessment: AssessmentSnapshot,
  options: { fallbackOnly?: boolean } = {}
) {
  const existing = await prisma.recruitmentCandidateDefence.findUnique({ where: { candidateId } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
      // Serialize defence creation on the candidate row. A retry or double
      // click therefore reuses the persisted questions and cannot trigger a
      // second model generation.
      await tx.$queryRaw`SELECT id FROM recruitment_candidates WHERE id = ${candidateId} FOR UPDATE`;
      const raced = await tx.recruitmentCandidateDefence.findUnique({ where: { candidateId } });
      if (raced) return raced;
      const generated = options.fallbackOnly
        ? { questions: fallbackDefenceQuestions(), personalised: false, model: null, error: "Main assessment deadline elapsed; deterministic fallback questions used." }
        : await generateQuestions(candidateId, assessment);
      const startedAt = new Date();
      const deadline = defenceDeadline(startedAt, assessment.defenceMinutes);
      const answers = generated.questions.map((question) => ({ questionId: question.id, text: "", savedAt: null }));
      const defence = await tx.recruitmentCandidateDefence.create({
        data: {
          candidateId,
          assessmentMode: assessment.assessmentMode,
          status: "in_progress",
          questions: generated.questions,
          answers,
          personalised: generated.personalised,
          model: generated.model,
          promptVersion: DEFENCE_PROMPT_VERSION,
          contentVersion: CONTENT_VERSION,
          generationError: generated.error,
          startedAt,
          deadline,
        },
      });
      await tx.recruitmentCandidate.update({
        where: { id: candidateId },
        data: { status: "defence", workLockedAt: startedAt },
      });
      await tx.recruitmentActivityEvent.create({
        data: { candidateId, eventType: "defence_started", metadata: { personalised: generated.personalised } },
      });
      return defence;
    }, { maxWait: 5_000, timeout: 20_000 });
}

export async function submitCandidateDefence(candidateId: string, submittedAt = new Date()) {
  return prisma.$transaction(async (tx) => {
    const defence = await tx.recruitmentCandidateDefence.update({
      where: { candidateId },
      data: { status: "submitted", submittedAt },
    });
    await tx.recruitmentCandidate.update({
      where: { id: candidateId },
      data: { status: "submitted", submittedAt },
    });
    await tx.recruitmentActivityEvent.create({
      data: { candidateId, eventType: "defence_submitted" },
    });
    await tx.recruitmentActivityEvent.create({
      data: { candidateId, eventType: "final_submission" },
    });
    return defence;
  });
}
