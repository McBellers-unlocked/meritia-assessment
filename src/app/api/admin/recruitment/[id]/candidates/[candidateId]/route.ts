import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * DELETE a candidate from an assessment.
 *
 * Cascade-deletes their RecruitmentResponse and RecruitmentInteraction rows.
 * Anonymous-ID slots are not reused; subsequent additions take the next
 * letter beyond the current maximum, which keeps marking continuity.
 *
 * Allowed at any status (invited, started, submitted) — the UI confirms
 * with a stronger warning if the candidate has already submitted.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; candidateId: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const candidate = await prisma.recruitmentCandidate.findUnique({
    where: { id: params.candidateId },
    select: { id: true, assessmentId: true, anonymousId: true, status: true },
  });
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (candidate.assessmentId !== params.id) {
    return NextResponse.json({ error: "Mismatch" }, { status: 400 });
  }

  await prisma.recruitmentCandidate.delete({ where: { id: candidate.id } });
  return NextResponse.json({ ok: true, removed: candidate.anonymousId });
}
