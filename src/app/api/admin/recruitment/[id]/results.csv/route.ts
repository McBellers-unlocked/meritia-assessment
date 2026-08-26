import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assertAssessmentAccess,
  requireScenarioBuilder,
} from "@/lib/admin-auth";
import { summarizeIntegrity } from "@/lib/recruit/integrity";

export const dynamic = "force-dynamic";

/**
 * CSV export of final results for a recruitment assessment.
 *
 * Includes name + email ONLY if the assessment has been revealed.
 * Otherwise the columns are present but empty — the panel can decide
 * whether to share an anonymous-only export.
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

  const candidates = await prisma.recruitmentCandidate.findMany({
    where: { assessmentId: a.id },
    orderBy: { totalScore: { sort: "desc", nulls: "last" } },
    select: {
      anonymousId: true, name: true, email: true, status: true,
      startedAt: true, submittedAt: true, totalScore: true,
      responses: { select: { taskNumber: true, score: true, wordCount: true } },
      activityEvents: { select: { eventType: true, metadata: true } },
      _count: { select: { interactions: { where: { actor: "candidate" } } } },
    },
  });

  const escape = (v: string | number | null | undefined) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`;

  const headers = [
    "rank", "anonymous_id", "name", "email", "status", "assessment_mode",
    "total_score", "task1_score", "task2_score",
    "task1_words", "task2_words",
    "candidate_messages",
    "pastes", "paste_chars", "tab_aways", "off_tab_seconds",
    "time_taken_min",
    "submitted_at",
  ].join(",");

  const lines = candidates.map((c, i) => {
    const t1 = c.responses.find((r) => r.taskNumber === 1);
    const t2 = c.responses.find((r) => r.taskNumber === 2);
    const integrity = summarizeIntegrity(c.activityEvents);
    const timeMin = c.startedAt && c.submittedAt
      ? Math.round((c.submittedAt.getTime() - c.startedAt.getTime()) / 60_000)
      : "";
    return [
      escape(i + 1),
      escape(c.anonymousId),
      escape(revealed ? c.name : ""),
      escape(revealed ? c.email : ""),
      escape(c.status),
      escape(a.assessmentMode),
      escape(c.totalScore ?? ""),
      escape(t1?.score ?? ""),
      escape(t2?.score ?? ""),
      escape(t1?.wordCount ?? ""),
      escape(t2?.wordCount ?? ""),
      escape(c._count.interactions),
      escape(integrity.pasteCount),
      escape(integrity.pasteChars),
      escape(integrity.tabAways),
      escape(Math.round(integrity.offTabMs / 1000)),
      escape(timeMin),
      escape(c.submittedAt ? c.submittedAt.toISOString() : ""),
    ].join(",");
  });

  const csv = [headers, ...lines].join("\r\n") + "\r\n";
  const filename = `${a.scenarioId}-results-${revealed ? "revealed" : "blind"}-${a.id}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
