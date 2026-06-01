import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assertAssessmentAccess,
  requireScenarioBuilder,
} from "@/lib/admin-auth";
import { getScenarioForAssessment } from "@/lib/recruit/scenario-loader";

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
  const auth = await requireScenarioBuilder();
  if (!auth.ok) return auth.response;
  const denied = await assertAssessmentAccess(auth, params.id);
  if (denied) return denied;

  const a = await prisma.recruitmentAssessment.findUnique({ where: { id: params.id } });
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Real task numbers for this scenario (1–5 for generated, 2 for legacy),
  // resolved through the same loader the candidate UI uses so it works for
  // both code-based and DB scenarios. This is the single source of truth
  // for "how many tasks must be marked", replacing the old hardcoded 2.
  const scenario = await getScenarioForAssessment(a);
  const taskNumbers = (scenario?.tasks ?? [])
    .map((t) => t.number)
    .sort((x, y) => x - y);
  const fallbackTaskNumbers = taskNumbers.length > 0 ? taskNumbers : [1, 2];

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
    const perTask = fallbackTaskNumbers.map((n) => {
      const r = c.responses.find((rr) => rr.taskNumber === n);
      return {
        taskNumber: n,
        score: r?.score ?? null,
        markedAt: r?.markedAt ?? null,
        wordCount: r?.wordCount ?? 0,
      };
    });
    const fullyMarked = perTask.every((t) => t.markedAt != null);
    const anyMarked = perTask.some((t) => t.score != null);
    return {
      id: c.id,
      anonymousId: c.anonymousId,
      startedAt: c.startedAt,
      submittedAt: c.submittedAt,
      timeTakenMin:
        c.startedAt && c.submittedAt
          ? Math.round((c.submittedAt.getTime() - c.startedAt.getTime()) / 60_000)
          : null,
      perTask,
      totalScore: c.totalScore,
      interactionCount: c._count.interactions,
      fullyMarked,
      anyMarked,
    };
  });

  const summary = {
    totalSubmitted: enriched.length,
    fullyMarked: enriched.filter((e) => e.fullyMarked).length,
    partiallyMarked: enriched.filter((e) => !e.fullyMarked && e.anyMarked).length,
    unmarked: enriched.filter((e) => !e.anyMarked).length,
  };

  return NextResponse.json({
    assessment: { id: a.id, title: a.title, scenarioId: a.scenarioId, revealedAt: a.revealedAt },
    taskNumbers: fallbackTaskNumbers,
    candidates: enriched,
    summary,
  });
}
