import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assertAssessmentAccess,
  requireScenarioBuilder,
} from "@/lib/admin-auth";
import { loadRubricForAssessment } from "@/lib/recruit/rubric";
import { getScenarioForAssessment } from "@/lib/recruit/scenario-loader";
import { isChatTask, isEmailInboxTask } from "@/lib/recruit/types";
import { analyzeTextReuse, type ReuseResult } from "@/lib/recruit/textReuse";

export const dynamic = "force-dynamic";

/**
 * GET — load one candidate's submission for marking. STRICTLY BLIND:
 *   does not return name, email, or any other identifying field. The
 *   admin sees only the anonymous ID.
 *
 * POST — save scores + comments + issuesIdentified for one or both tasks.
 *   Body: { task1?: {score, comments, issuesIdentified}, task2?: {...} }
 *   Recomputes candidate.totalScore from the per-task scores.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; candidateId: string } }
) {
  const auth = await requireScenarioBuilder();
  if (!auth.ok) return auth.response;
  const denied = await assertAssessmentAccess(auth, params.id);
  if (denied) return denied;

  const c = await prisma.recruitmentCandidate.findUnique({
    where: { id: params.candidateId },
    select: {
      id: true,
      assessmentId: true,
      anonymousId: true,
      startedAt: true,
      submittedAt: true,
      totalScore: true,
      assessment: { select: { id: true, title: true, scenarioId: true, customScenarioId: true, revealedAt: true } },
      responses: {
        select: {
          taskNumber: true, content: true, wordCount: true, sentAt: true,
          score: true, comments: true, issuesIdentified: true, markedAt: true,
        },
      },
      interactions: {
        orderBy: { sequenceNum: "asc" },
        select: {
          id: true, sequenceNum: true, taskNumber: true,
          timestamp: true, actor: true, content: true,
        },
      },
      activityEvents: {
        orderBy: { occurredAt: "asc" },
        select: {
          id: true, occurredAt: true, eventType: true, taskNumber: true, metadata: true,
        },
      },
    },
  });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (c.assessmentId !== params.id) return NextResponse.json({ error: "Mismatch" }, { status: 400 });

  // Integrity signal: how much of each memo overlaps with the AI "knowledge
  // system" output the candidate saw (lexical text reuse — detects copy-paste).
  // Computed in-memory from data already loaded above; advisory only, never
  // scored. Keyed by task number; non-memo tasks have no response row and so
  // get no entry.
  const reuseByTask: Record<number, ReuseResult> = {};
  for (const r of c.responses) {
    const aiTexts = c.interactions
      .filter((i) => i.taskNumber === r.taskNumber && i.actor === "ai")
      .map((i) => i.content);
    reuseByTask[r.taskNumber] = analyzeTextReuse(r.content ?? "", aiTexts);
  }

  const rubric = await loadRubricForAssessment(c.assessment);

  // Resolve the scenario so the marker can see non-memo tasks (the email
  // in-tray and the live persona chat) alongside the scored memos, plus the
  // candidate's email-triage decisions. Scenario content is not candidate
  // identity, so it's safe under blind marking.
  const scenario = await getScenarioForAssessment(c.assessment);
  const scenarioTasks = (scenario?.tasks ?? []).map((t) => {
    if (isEmailInboxTask(t)) {
      return {
        number: t.number,
        kind: t.kind,
        title: t.title,
        emails: t.emails.map((e) => ({
          id: e.id,
          senderName: e.senderName,
          senderEmail: e.senderEmail,
          subject: e.subject,
          bodyHtml: e.bodyHtml,
          triggerOffsetSeconds: e.triggerOffsetSeconds,
          expectedAction: e.expectedAction,
          markerNotes: e.markerNotes,
        })),
      };
    }
    if (isChatTask(t)) {
      return {
        number: t.number,
        kind: t.kind,
        title: t.title,
        persona: {
          personaName: t.script.personaName,
          personaRole: t.script.personaRole,
          openerMessage: t.script.openerMessage,
          maxTurns: t.script.maxTurns,
          expectedOutcomes: t.script.expectedOutcomes,
        },
      };
    }
    return { number: t.number, kind: t.kind, title: t.title };
  });

  const emailResponses = await prisma.recruitmentEmailResponse.findMany({
    where: { candidateId: c.id },
    orderBy: { deliveredAt: "asc" },
    select: {
      emailId: true,
      action: true,
      replyBody: true,
      deliveredAt: true,
      respondedAt: true,
      markerComment: true,
    },
  });

  return NextResponse.json({
    candidate: {
      id: c.id,
      anonymousId: c.anonymousId,                // anon only — no name/email leak
      startedAt: c.startedAt,
      submittedAt: c.submittedAt,
      timeTakenMin:
        c.startedAt && c.submittedAt
          ? Math.round((c.submittedAt.getTime() - c.startedAt.getTime()) / 60_000)
          : null,
      totalScore: c.totalScore,
    },
    assessment: c.assessment,
    assistantName: scenario?.assistantName ?? null,
    assistantShortName: scenario?.assistantShortName ?? null,
    rubric,
    scenarioTasks,
    responses: c.responses,
    interactions: c.interactions,
    emailResponses,
    activityEvents: c.activityEvents,
    reuseByTask,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; candidateId: string } }
) {
  const auth = await requireScenarioBuilder();
  if (!auth.ok) return auth.response;
  const denied = await assertAssessmentAccess(auth, params.id);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));

  const candidate = await prisma.recruitmentCandidate.findUnique({
    where: { id: params.candidateId },
    select: { id: true, assessmentId: true },
  });
  if (!candidate || candidate.assessmentId !== params.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const markerId = auth.session.user.id;
  const now = new Date();
  type TaskUpdate = { score?: number | null; comments?: string | null; issuesIdentified?: string[] | null };
  // Accept any `taskN` key (N a positive integer), not just task1/task2 —
  // generated scenarios carry 1–5 tasks. The marking page posts one task
  // at a time, but a loop keeps this robust to multi-task payloads.
  const incoming: Record<number, TaskUpdate> = {};
  for (const [key, value] of Object.entries(body)) {
    const m = /^task(\d+)$/.exec(key);
    if (m && value && typeof value === "object") {
      incoming[Number(m[1])] = value as TaskUpdate;
    }
  }

  for (const [k, v] of Object.entries(incoming)) {
    const taskNumber = Number(k);
    const score = v.score != null ? Number(v.score) : null;
    const comments = typeof v.comments === "string" ? v.comments : null;
    const issuesIdentified = Array.isArray(v.issuesIdentified) ? v.issuesIdentified.map(String) : null;
    if (score != null && (isNaN(score) || score < 0 || score > 100)) {
      return NextResponse.json({ error: `Task ${taskNumber} score must be 0-100` }, { status: 400 });
    }

    await prisma.recruitmentResponse.upsert({
      where: { candidateId_taskNumber: { candidateId: candidate.id, taskNumber } },
      create: {
        candidateId: candidate.id,
        taskNumber,
        content: "",
        wordCount: 0,
        score,
        comments,
        issuesIdentified: (issuesIdentified ?? null) as unknown as object,
        markedAt: now,
        markedById: markerId,
      },
      update: {
        score,
        comments,
        issuesIdentified: (issuesIdentified ?? null) as unknown as object,
        markedAt: now,
        markedById: markerId,
      },
    });
  }

  // Recompute totalScore: sum of any non-null per-task scores
  const responses = await prisma.recruitmentResponse.findMany({
    where: { candidateId: candidate.id },
    select: { score: true },
  });
  const totalScore = responses
    .filter((r) => r.score != null)
    .reduce((s, r) => s + (r.score ?? 0), 0);
  await prisma.recruitmentCandidate.update({
    where: { id: candidate.id },
    data: { totalScore: totalScore || null },
  });

  return NextResponse.json({ ok: true, totalScore });
}
