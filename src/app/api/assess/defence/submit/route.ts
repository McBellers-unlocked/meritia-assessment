import { NextRequest, NextResponse } from "next/server";
import { loadCandidate, verifySessionCookie } from "@/lib/recruit/candidate-auth";
import { submitCandidateDefence } from "@/lib/recruit/defence-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();
  const result = await loadCandidate(token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  if (result.candidate.status === "submitted") return NextResponse.json({ ok: true, alreadySubmitted: true });
  if (result.candidate.status !== "defence") return NextResponse.json({ error: "Defence is not active." }, { status: 400 });
  if (!(await verifySessionCookie(result.candidate))) return NextResponse.json({ error: "Session mismatch." }, { status: 403 });
  const defence = await submitCandidateDefence(result.candidate.id);
  return NextResponse.json({ ok: true, submittedAt: defence.submittedAt });
}
