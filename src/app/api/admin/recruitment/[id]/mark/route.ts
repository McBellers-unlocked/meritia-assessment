import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/recruitment/[id]/mark
 *   Lists submitted candidates for marking, BLIND — returns anon IDs only,
 *   never names or emails. Includes per-candidate marking status.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const a = await prisma.recruitmentAssessment.findUnique({ where: { id: params.id } });
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const candidates = await prisma.recruitmentCandidate.findMany({
    where: { assessmentId: a.id, status: "submitted" },
    orderBy: { anonymousId: "asc" },
    select: {
      id: true,
      anonymousId: true,
      startedAt: true,
      submittedAt: true,
      totalScore: true,
      responses: { select: { taskNumber: true, score: true, markedAt: true, wordCount: true } },
      _count: { select: { interactions: true } },
    },
  });

  const enriched = candidates.map((c) => {
    const t1 = c.responses.find((r) => r.taskNumber === 1);
    const t2 = c.responses.find((r) => r.taskNumber === 2);
    const fullyMarked = (t1?.markedAt && t2?.markedAt) ? true : false;
    return {
      id: c.id,
      anonymousId: c.anonymousId,
      startedAt: c.startedAt,
      submittedAt: c.submittedAt,
      timeTakenMin:
        c.startedAt && c.submittedAt
          ? Math.round((c.submittedAt.getTime() - c.startedAt.getTime()) / 60_000)
          : null,
      task1: { score: t1?.score ?? null, markedAt: t1?.markedAt ?? null, wordCount: t1?.wordCount ?? 0 },
      task2: { score: t2?.score ?? null, markedAt: t2?.markedAt ?? null, wordCount: t2?.wordCount ?? 0 },
      totalScore: c.totalScore,
      interactionCount: c._count.interactions,
      fullyMarked,
    };
  });

  const summary = {
    totalSubmitted: enriched.length,
    fullyMarked: enriched.filter((e) => e.fullyMarked).length,
    partiallyMarked: enriched.filter((e) => !e.fullyMarked && (e.task1.score != null || e.task2.score != null)).length,
    unmarked: enriched.filter((e) => e.task1.score == null && e.task2.score == null).length,
  };

  return NextResponse.json({
    assessment: { id: a.id, title: a.title, scenarioId: a.scenarioId, revealedAt: a.revealedAt },
    candidates: enriched,
    summary,
  });
}
