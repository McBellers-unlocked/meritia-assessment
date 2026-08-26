import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertScenarioAccess, requireScenarioBuilder } from "@/lib/admin-auth";
import { BUILDER_MODEL } from "@/lib/recruit/model-config";
import { VALIDATION_PROMPT_VERSION } from "@/lib/recruit/prompt-versions";
import { enqueueValidationRun } from "@/lib/recruit/sqs-client";
import { getScenarioContentHash, hashScenarioSnapshot, loadScenarioContentSnapshot } from "@/lib/recruit/scenario-content-hash";
import { runDeterministicChecks } from "@/lib/recruit/validation/deterministic";
import { evaluatePublicationReadiness } from "@/lib/recruit/validation/publication-readiness";

export const dynamic = "force-dynamic";

async function authorise(scenarioId: string) {
  const auth = await requireScenarioBuilder();
  if (!auth.ok) return { response: auth.response } as const;
  const denied = await assertScenarioAccess(auth, scenarioId);
  if (denied) return { response: denied } as const;
  return { auth } as const;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const access = await authorise(params.id);
  if ("response" in access) return access.response;
  const scenario = await prisma.recruitmentScenario.findUnique({
    where: { id: params.id },
    include: {
      criteria: { orderBy: { order: "asc" }, include: { taskMappings: { include: { task: { select: { id: true, number: true, title: true } } } } } },
      validationRuns: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true, scenarioId: true, scenarioHash: true, assessmentMode: true,
          status: true, progressStage: true, overallReadiness: true,
          promptVersion: true, model: true, contentVersion: true,
          deterministicChecks: true, findings: true, criterionCoverage: true,
          syntheticProfiles: true, policyTests: true, summary: true, error: true,
          createdById: true, startedAt: true, completedAt: true, createdAt: true,
        },
      },
      reviews: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const currentHash = await getScenarioContentHash(params.id);
  const readiness = await evaluatePublicationReadiness(scenario);
  return NextResponse.json({
    source: "db",
    currentHash,
    latestRunStale: scenario.validationRuns[0] ? scenario.validationRuns[0].scenarioHash !== currentHash : true,
    readiness,
    criteria: scenario.criteria,
    runs: scenario.validationRuns,
    reviews: scenario.reviews,
  });
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const access = await authorise(params.id);
  if ("response" in access) return access.response;
  const snapshot = await loadScenarioContentSnapshot(params.id);
  if (!snapshot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scenarioHash = hashScenarioSnapshot(snapshot);
  const deterministic = runDeterministicChecks(snapshot);
  const claimed = await prisma.$transaction(async (tx) => {
    // Serialize starts on the scenario row so two clicks cannot enqueue two
    // current runs for the same content hash.
    await tx.$queryRaw`SELECT id FROM recruitment_scenarios WHERE id = ${params.id} FOR UPDATE`;
    const existing = await tx.recruitmentScenarioValidationRun.findFirst({
      where: { scenarioId: params.id, scenarioHash, status: { in: ["QUEUED", "RUNNING"] } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return { run: existing, reused: true };
    const run = await tx.recruitmentScenarioValidationRun.create({
      data: {
        scenarioId: params.id,
        scenarioHash,
        assessmentMode: snapshot.assessmentMode,
        status: "QUEUED",
        progressStage: "Preparing scenario snapshot",
        overallReadiness: "Preflight running",
        promptVersion: VALIDATION_PROMPT_VERSION,
        model: BUILDER_MODEL,
        scenarioSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        deterministicChecks: deterministic.checks as unknown as Prisma.InputJsonValue,
        findings: deterministic.findings as unknown as Prisma.InputJsonValue,
        criterionCoverage: deterministic.blueprint as unknown as Prisma.InputJsonValue,
        createdById: access.auth.userId,
      },
    });
    return { run, reused: false };
  });
  if (claimed.reused) return NextResponse.json({ run: claimed.run, reused: true });
  const run = claimed.run;
  try {
    await enqueueValidationRun(run.id);
  } catch (error) {
    const failed = await prisma.recruitmentScenarioValidationRun.update({
      where: { id: run.id },
      data: { status: "FAILED", progressStage: "Queueing failed", overallReadiness: "Preflight required", error: (error as Error).message, completedAt: new Date() },
    });
    return NextResponse.json({ error: "Could not queue Validation Lab run", run: failed }, { status: 502 });
  }
  return NextResponse.json({ run }, { status: 202 });
}
