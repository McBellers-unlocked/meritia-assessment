import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadCandidate, verifySessionCookie } from "@/lib/recruit/candidate-auth";
import { autosaveDefenceAnswer, type DefenceAnswer } from "@/lib/recruit/defence";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();
  const questionId = String(body.questionId ?? "").trim();
  const answer = String(body.answer ?? "").slice(0, 8_000);
  if (!token || !questionId) return NextResponse.json({ error: "token and questionId required" }, { status: 400 });
  const result = await loadCandidate(token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  if (result.candidate.status !== "defence") return NextResponse.json({ error: "Defence is not active." }, { status: 400 });
  if (!(await verifySessionCookie(result.candidate))) return NextResponse.json({ error: "Session mismatch." }, { status: 403 });
  const defence = await prisma.recruitmentCandidateDefence.findUnique({ where: { candidateId: result.candidate.id } });
  if (!defence || defence.deadline < new Date()) return NextResponse.json({ error: "Defence deadline has elapsed." }, { status: 400 });
  const answers = Array.isArray(defence.answers) ? (defence.answers as unknown as DefenceAnswer[]) : [];
  const savedAt = new Date().toISOString();
  const next = autosaveDefenceAnswer(answers, questionId, answer, savedAt);
  if (!next) return NextResponse.json({ error: "Unknown defence question." }, { status: 400 });
  await prisma.recruitmentCandidateDefence.update({
    where: { candidateId: result.candidate.id },
    data: { answers: next as unknown as Prisma.InputJsonValue },
  });
  return NextResponse.json({ ok: true, savedAt });
}
