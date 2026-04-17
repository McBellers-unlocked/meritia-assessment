import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadCandidate, verifySessionCookie } from "@/lib/recruit/candidate-auth";
import { getScenarioForAssessment } from "@/lib/recruit/scenario-loader";
import { isMemoAiTask } from "@/lib/recruit/types";

export const dynamic = "force-dynamic";

/**
 * Read full candidate state: scenario content (both tasks), responses,
 * interactions, server-side time remaining.
 *
 * Pre-start (status=invited): returns scenario meta only (no exhibits / prompts)
 * so the landing page can render a brief without leaking content.
 *
 * Started: full content + the candidate's responses + interactions for both tasks.
 *
 * Submitted/expired: read-only view, no further mutation accepted.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const result = await loadCandidate(params.token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { candidate, assessment } = result;

  const scenario = await getScenarioForAssessment(assessment);
  if (!scenario) return NextResponse.json({ error: "Scenario config missing" }, { status: 500 });

  // PRE-START: minimal payload
  if (candidate.status === "invited") {
    return NextResponse.json({
      stage: "invited",
      assessment: {
        title: assessment.title,
        totalMinutes: assessment.totalMinutes,
        closeDate: assessment.closeDate,
      },
      scenario: {
        title: scenario.title,
        organisation: scenario.organisation,
        positionTitle: scenario.positionTitle,
        taskCount: scenario.tasks.length,
      },
      candidate: { anonymousId: candidate.anonymousId },
    });
  }

  // For started/submitted, require the cookie
  const cookieOk = await verifySessionCookie(candidate);
  if (candidate.status === "started" && !cookieOk) {
    return NextResponse.json(
      { error: "This assessment is in progress in another browser session." },
      { status: 403 }
    );
  }

  const responses = await prisma.recruitmentResponse.findMany({
    where: { candidateId: candidate.id },
    orderBy: { taskNumber: "asc" },
  });
  const interactions = await prisma.recruitmentInteraction.findMany({
    where: { candidateId: candidate.id },
    orderBy: { sequenceNum: "asc" },
    select: { id: true, sequenceNum: true, taskNumber: true, timestamp: true, actor: true, content: true },
  });

  return NextResponse.json({
    stage: candidate.status, // "started" | "submitted" | "expired"
    assessment: {
      id: assessment.id,
      title: assessment.title,
      totalMinutes: assessment.totalMinutes,
      closeDate: assessment.closeDate,
    },
    scenario: {
      title: scenario.title,
      organisation: scenario.organisation,
      positionTitle: scenario.positionTitle,
      // taskCount reports ALL tasks so the landing page accurately describes
      // what the candidate will encounter. `tasks` below is narrowed to the
      // memo_ai subset — those are the tasks the AssessmentView renders
      // directly. Email and chat tasks come in through /api/assess/events
      // and are rendered by the LiveEventsOverlay.
      taskCount: scenario.tasks.length,
      tasks: scenario.tasks
        .filter(isMemoAiTask)
        .map((t) => ({
          number: t.number,
          kind: t.kind,
          title: t.title,
          briefMarkdown: t.briefMarkdown,
          totalMarks: t.totalMarks,
          exhibitTitle: t.exhibitTitle,
          exhibitHtml: t.exhibitHtml,
          deliverableLabel: t.deliverableLabel,
          deliverablePlaceholder: t.deliverablePlaceholder,
        })),
    },
    candidate: {
      anonymousId: candidate.anonymousId,
      startedAt: candidate.startedAt,
      deadline: candidate.deadline,
      submittedAt: candidate.submittedAt,
    },
    responses: responses.map((r) => ({
      taskNumber: r.taskNumber,
      content: r.content,
      wordCount: r.wordCount,
      updatedAt: r.updatedAt,
    })),
    interactions,
  });
}
