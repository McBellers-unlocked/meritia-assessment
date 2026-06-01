import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assertAssessmentAccess,
  requireScenarioBuilder,
} from "@/lib/admin-auth";
import { allIssuesNormalized, loadRubricForAssessment } from "@/lib/recruit/rubric";
import { getScenarioForAssessment } from "@/lib/recruit/scenario-loader";

export const dynamic = "force-dynamic";

/**
 * Aggregated results for one assessment.
 *
 * Always returns ranking + analytics. Includes name + email ONLY if the
 * assessment has been revealed (revealedAt is set). Before reveal, even
 * an admin sees anonymous IDs.
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
  const revealed = a.revealedAt != null;

  // Real task numbers for this scenario (1–5 generated, 2 legacy),
  // resolved via the shared loader so it works for code and DB scenarios.
  // Used as the source of truth for "fully marked" — the old hardcoded
  // t1 && t2 could never be satisfied by a 3+ task generated scenario.
  const scenario = await getScenarioForAssessment(a);
  const markTaskNumbers = (() => {
    const nums = (scenario?.tasks ?? []).map((t) => t.number).sort((x, y) => x - y);
    return nums.length > 0 ? nums : [1, 2];
  })();

  const candidates = await prisma.recruitmentCandidate.findMany({
    where: { assessmentId: a.id },
    orderBy: { totalScore: { sort: "desc", nulls: "last" } },
    select: {
      id: true, name: true, email: true,
      anonymousId: true, status: true,
      startedAt: true, submittedAt: true, totalScore: true,
      responses: { select: { taskNumber: true, score: true, issuesIdentified: true, wordCount: true, markedAt: true } },
      _count: {
        select: {
          interactions: { where: { actor: "candidate" } },
        },
      },
    },
  });

  const ranking = candidates.map((c) => {
    const t1 = c.responses.find((r) => r.taskNumber === 1);
    const t2 = c.responses.find((r) => r.taskNumber === 2);
    // Embedded issues ticked across ALL tasks (generated scenarios can
    // have up to 5), used by the cohort issue analytics below.
    const allIssuesIdentified = c.responses.flatMap(
      (r) => (r.issuesIdentified as string[] | null) ?? [],
    );
    // Fully marked = every real task for this scenario has been marked.
    const fullyMarked = markTaskNumbers.every(
      (n) => c.responses.find((r) => r.taskNumber === n)?.markedAt != null,
    );
    return {
      candidateId: c.id,
      anonymousId: c.anonymousId,
      // Identity revealed only after admin confirms
      name: revealed ? c.name : null,
      email: revealed ? c.email : null,
      status: c.status,
      submittedAt: c.submittedAt,
      timeTakenMin:
        c.startedAt && c.submittedAt
          ? Math.round((c.submittedAt.getTime() - c.startedAt.getTime()) / 60_000)
          : null,
      totalScore: c.totalScore,
      task1Score: t1?.score ?? null,
      task2Score: t2?.score ?? null,
      task1Words: t1?.wordCount ?? 0,
      task2Words: t2?.wordCount ?? 0,
      candidateMessageCount: c._count.interactions,
      task1IssuesIdentified: (t1?.issuesIdentified as string[] | null) ?? [],
      task2IssuesIdentified: (t2?.issuesIdentified as string[] | null) ?? [],
      allIssuesIdentified,
      fullyMarked,
    };
  });

  // Analytics — only consider candidates with at least one task scored.
  const scored = ranking.filter((r) => r.totalScore != null);
  const fullyMarked = ranking.filter((r) => r.fullyMarked);

  const sum = (arr: number[]) => arr.reduce((s, n) => s + n, 0);
  const avg = (arr: number[]) => (arr.length ? sum(arr) / arr.length : null);
  const corr = (xs: number[], ys: number[]): number | null => {
    if (xs.length < 2 || xs.length !== ys.length) return null;
    const mx = sum(xs) / xs.length;
    const my = sum(ys) / ys.length;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      dx += (xs[i] - mx) ** 2;
      dy += (ys[i] - my) ** 2;
    }
    if (dx === 0 || dy === 0) return null;
    return num / Math.sqrt(dx * dy);
  };

  const totals = scored.map((r) => r.totalScore!).filter((n): n is number => n != null);
  const t1scores = scored.map((r) => r.task1Score).filter((n): n is number => n != null);
  const t2scores = scored.map((r) => r.task2Score).filter((n): n is number => n != null);
  const times = scored.map((r) => r.timeTakenMin).filter((n): n is number => n != null);
  const messageCounts = scored.map((r) => r.candidateMessageCount);

  // Score distribution histogram (buckets of 10)
  const histogram = Array.from({ length: 10 }, (_, i) => ({ bucket: `${i * 10}-${i * 10 + 9}`, count: 0 }));
  histogram.push({ bucket: "100", count: 0 });
  for (const t of totals) {
    const idx = Math.min(10, Math.floor(t / 10));
    histogram[idx].count += 1;
  }

  // Embedded-issue identification analytics — derived from rubric
  // metadata. Now N-task aware: works for both the legacy JSON rubrics
  // and the per-task rubrics authored for generated scenarios.
  const rubric = await loadRubricForAssessment(a);
  const issueAnalytics = rubric
    ? allIssuesNormalized(rubric).map((iss) => {
        const found = fullyMarked.filter((c) =>
          c.allIssuesIdentified.includes(iss.id),
        );
        return {
          id: iss.id,
          title: iss.title,
          maxMarks: iss.max_marks ?? null,
          identifiedCount: found.length,
          identifiedRate: fullyMarked.length ? found.length / fullyMarked.length : null,
        };
      })
    : [];

  // Correlation between candidate-message count and total score
  const messageScoreCorr = corr(messageCounts.slice(0, scored.length), totals);

  return NextResponse.json({
    assessment: {
      id: a.id, title: a.title, scenarioId: a.scenarioId,
      revealedAt: a.revealedAt, totalMinutes: a.totalMinutes,
    },
    revealed,
    ranking,
    analytics: {
      submittedCount: ranking.filter((r) => r.status === "submitted").length,
      scoredCount: scored.length,
      fullyMarkedCount: fullyMarked.length,
      averageTotal: avg(totals),
      averageTask1: avg(t1scores),
      averageTask2: avg(t2scores),
      averageTimeMin: avg(times),
      averageMessages: avg(messageCounts),
      messageCountScoreCorrelation: messageScoreCorr,
      histogram,
      issueAnalytics,
    },
  });
}
