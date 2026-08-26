import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertScenarioAccess, requireScenarioBuilder } from "@/lib/admin-auth";
import { getScenarioContentHash } from "@/lib/recruit/scenario-content-hash";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string; runId: string } }) {
  const auth = await requireScenarioBuilder();
  if (!auth.ok) return auth.response;
  const denied = await assertScenarioAccess(auth, params.id);
  if (denied) return denied;
  const run = await prisma.recruitmentScenarioValidationRun.findFirst({ where: { id: params.runId, scenarioId: params.id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const currentHash = await getScenarioContentHash(params.id);
  return NextResponse.json({ run, stale: run.scenarioHash !== currentHash, currentHash });
}
