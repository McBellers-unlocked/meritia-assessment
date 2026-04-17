import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadCandidate, verifySessionCookie } from "@/lib/recruit/candidate-auth";

export const dynamic = "force-dynamic";

/**
 * Submit the entire assessment. Idempotent.
 *
 * Body: { token }. Marks status=submitted, sets submittedAt, locks further
 * mutations. The candidate UI then transitions to the thank-you screen.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token ?? "").trim();
    const result = await loadCandidate(token);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    if (result.candidate.status === "submitted") {
      return NextResponse.json({ ok: true, alreadySubmitted: true });
    }
    if (result.candidate.status !== "started") {
      return NextResponse.json({ error: "Cannot submit; assessment not in progress." }, { status: 400 });
    }
    const cookieOk = await verifySessionCookie(result.candidate);
    if (!cookieOk) return NextResponse.json({ error: "Session mismatch." }, { status: 403 });

    const now = new Date();
    await prisma.recruitmentCandidate.update({
      where: { id: result.candidate.id },
      data: { status: "submitted", submittedAt: now },
    });
    return NextResponse.json({ ok: true, submittedAt: now });
  } catch (e) {
    console.error("[assess submit]", e);
    return NextResponse.json({ error: (e as Error).message || "Submit failed" }, { status: 500 });
  }
}
