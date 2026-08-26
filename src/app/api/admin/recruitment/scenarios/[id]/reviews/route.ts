import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertScenarioAccess, requireScenarioBuilder } from "@/lib/admin-auth";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireScenarioBuilder();
  if (!auth.ok) return auth.response;
  const denied = await assertScenarioAccess(auth, params.id);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const validationRunId = String(body.validationRunId ?? "").trim();
  const reviewType = String(body.reviewType ?? "");
  const decision = String(body.decision ?? "");
  const notes = String(body.notes ?? "").trim().slice(0, 10_000);
  if (!["SUBJECT_MATTER", "ASSESSMENT_DESIGN", "ACCESSIBILITY"].includes(reviewType)) return NextResponse.json({ error: "Invalid review type" }, { status: 400 });
  if (!["APPROVED", "CHANGES_REQUIRED", "APPROVED_WITH_LIMITATIONS"].includes(decision)) return NextResponse.json({ error: "Invalid review decision" }, { status: 400 });
  if (!notes) return NextResponse.json({ error: "Review notes are required" }, { status: 400 });
  const run = validationRunId ? await prisma.recruitmentScenarioValidationRun.findFirst({ where: { id: validationRunId, scenarioId: params.id } }) : null;
  if (!run) return NextResponse.json({ error: "A Validation Lab run for this scenario is required" }, { status: 400 });
  const review = await prisma.recruitmentScenarioReview.create({
    data: { scenarioId: params.id, validationRunId: run.id, reviewType: reviewType as "SUBJECT_MATTER" | "ASSESSMENT_DESIGN" | "ACCESSIBILITY", decision: decision as "APPROVED" | "CHANGES_REQUIRED" | "APPROVED_WITH_LIMITATIONS", notes, reviewerId: auth.userId },
  });
  return NextResponse.json({ review });
}
