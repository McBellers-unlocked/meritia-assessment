import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadCandidate, verifySessionCookie } from "@/lib/recruit/candidate-auth";

export const dynamic = "force-dynamic";

/**
 * Autosave a candidate's memo for one task. Body: { token, taskNumber, content }.
 * Idempotent upsert keyed on (candidateId, taskNumber).
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token ?? "").trim();
    const taskNumber = Number(body.taskNumber);
    const content = String(body.content ?? "");
    if (!token || !(taskNumber === 1 || taskNumber === 2)) {
      return NextResponse.json({ error: "token, taskNumber required" }, { status: 400 });
    }
    if (content.length > 50_000) return NextResponse.json({ error: "Memo too long" }, { status: 400 });

    const result = await loadCandidate(token);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    if (result.nowExpired || result.candidate.status !== "started") {
      return NextResponse.json({ error: "Assessment is no longer active." }, { status: 400 });
    }
    const cookieOk = await verifySessionCookie(result.candidate);
    if (!cookieOk) return NextResponse.json({ error: "Session mismatch." }, { status: 403 });

    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    const saved = await prisma.recruitmentResponse.upsert({
      where: { candidateId_taskNumber: { candidateId: result.candidate.id, taskNumber } },
      create: { candidateId: result.candidate.id, taskNumber, content, wordCount },
      update: { content, wordCount },
    });

    return NextResponse.json({
      taskNumber: saved.taskNumber,
      wordCount: saved.wordCount,
      updatedAt: saved.updatedAt,
    });
  } catch (e) {
    console.error("[assess memo]", e);
    return NextResponse.json({ error: (e as Error).message || "Save failed" }, { status: 500 });
  }
}
