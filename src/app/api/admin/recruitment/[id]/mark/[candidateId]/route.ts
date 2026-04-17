import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { loadRubric } from "@/lib/recruit/rubric";

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
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const c = await prisma.recruitmentCandidate.findUnique({
    where: { id: params.candidateId },
    select: {
      id: true,
      assessmentId: true,
      anonymousId: true,
      startedAt: true,
      submittedAt: true,
      totalScore: true,
      assessment: { select: { id: true, title: true, scenarioId: true, revealedAt: true } },
      responses: {
        select: {
          taskNumber: true, content: true, wordCount: true,
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

  const rubric = loadRubric(c.assessment.scenarioId);

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
    rubric,
    responses: c.responses,
    interactions: c.interactions,
    activityEvents: c.activityEvents,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; candidateId: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

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
  const incoming: Record<number, TaskUpdate> = {};
  if (body.task1) incoming[1] = body.task1;
  if (body.task2) incoming[2] = body.task2;

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
