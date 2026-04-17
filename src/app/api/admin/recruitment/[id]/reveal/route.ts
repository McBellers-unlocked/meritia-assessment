import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * POST — flip the assessment into reveal mode.
 *   Idempotent: if already revealed, returns the existing revealedAt.
 *   The action is one-way (no un-reveal). The UI confirms before calling.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const a = await prisma.recruitmentAssessment.findUnique({ where: { id: params.id } });
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (a.revealedAt) {
    return NextResponse.json({ ok: true, alreadyRevealed: true, revealedAt: a.revealedAt });
  }
  const updated = await prisma.recruitmentAssessment.update({
    where: { id: a.id },
    data: { revealedAt: new Date() },
  });
  return NextResponse.json({ ok: true, revealedAt: updated.revealedAt });
}
