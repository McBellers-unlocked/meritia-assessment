import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadCandidate, verifySessionCookie } from "@/lib/recruit/candidate-auth";
import { getScenarioForAssessment } from "@/lib/recruit/scenario-loader";
import { isMemoAiTask } from "@/lib/recruit/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/assess/memo/send  body: { token, taskNumber }
 *
 * Marks a memo "sent" — a soft, per-task finalise the candidate triggers when
 * they're done with one memo and want to move to the next. Sets sentAt; does
 * NOT lock the memo (re-send updates the timestamp) and is independent of the
 * overall /api/assess/submit, which remains the hard finaliser.
 *
 * The task must be a memo_ai task on the resolved scenario (validated against
 * the scenario config, so this works for any task numbering — no hardcoded
 * 1|2 like the autosave route).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token ?? "").trim();
    const taskNumber = Number(body.taskNumber);
    if (!token || !Number.isInteger(taskNumber) || taskNumber < 1) {
      return NextResponse.json({ error: "token, taskNumber required" }, { status: 400 });
    }

    const result = await loadCandidate(token);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    if (result.nowExpired || result.candidate.status !== "started") {
      return NextResponse.json({ error: "Assessment is no longer active." }, { status: 400 });
    }
    const cookieOk = await verifySessionCookie(result.candidate);
    if (!cookieOk) return NextResponse.json({ error: "Session mismatch." }, { status: 403 });

    const scenario = await getScenarioForAssessment(result.assessment);
    if (!scenario) return NextResponse.json({ error: "Scenario config missing" }, { status: 500 });
    const task = scenario.tasks.find((t) => t.number === taskNumber);
    if (!task || !isMemoAiTask(task)) {
      return NextResponse.json({ error: "Not a memo task on this scenario" }, { status: 400 });
    }

    const now = new Date();
    const saved = await prisma.recruitmentResponse.upsert({
      where: { candidateId_taskNumber: { candidateId: result.candidate.id, taskNumber } },
      // The autosave route normally creates the row first; create defensively
      // in case a candidate hits Send before any autosave landed.
      create: { candidateId: result.candidate.id, taskNumber, content: "", wordCount: 0, sentAt: now },
      update: { sentAt: now },
    });

    return NextResponse.json({ taskNumber: saved.taskNumber, sentAt: saved.sentAt });
  } catch (e) {
    console.error("[assess memo send]", e);
    return NextResponse.json({ error: (e as Error).message || "Send failed" }, { status: 500 });
  }
}
