import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertScenarioAccess, requireScenarioBuilder } from "@/lib/admin-auth";
import type { ValidationFinding } from "@/lib/recruit/validation/types";

export async function PATCH(request: NextRequest, { params }: { params: { id: string; runId: string } }) {
  const auth = await requireScenarioBuilder();
  if (!auth.ok) return auth.response;
  const denied = await assertScenarioAccess(auth, params.id);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const findingId = String(body.findingId ?? "");
  const disposition = String(body.disposition ?? "");
  const reviewerNote = String(body.reviewerNote ?? "").trim().slice(0, 4_000);
  if (!findingId || !["open", "resolved", "accepted_risk", "dismissed"].includes(disposition)) return NextResponse.json({ error: "findingId and valid disposition required" }, { status: 400 });
  if (disposition !== "open" && !reviewerNote) return NextResponse.json({ error: "A reviewer rationale is required." }, { status: 400 });
  const run = await prisma.recruitmentScenarioValidationRun.findFirst({ where: { id: params.runId, scenarioId: params.id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const findings = Array.isArray(run.findings) ? (run.findings as unknown as ValidationFinding[]) : [];
  if (!findings.some((item) => item.id === findingId)) return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  const next = findings.map((item) => item.id === findingId ? { ...item, disposition: disposition as ValidationFinding["disposition"], reviewerNote } : item);
  await prisma.recruitmentScenarioValidationRun.update({ where: { id: run.id }, data: { findings: next as unknown as Prisma.InputJsonValue } });
  return NextResponse.json({ findings: next });
}
