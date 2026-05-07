import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireScenarioBuilder } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/recruitment/scenarios/from-jd/generate-task/[jobId]
 *   → { status, result?, error?, elapsedMs }
 *
 * Polled by the wizard while a generation job is in flight. The job
 * row is written by the worker Lambda when it completes (or fails).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const auth = await requireScenarioBuilder();
  if (!auth.ok) return auth.response;

  const job = await prisma.recruitmentScenarioGenerationJob.findUnique({
    where: { id: params.jobId },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // DEMO sessions can only poll their own jobs; full ADMIN can poll any.
  if (auth.role === "DEMO" && job.createdById !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = Date.now();
  const startedRef = job.startedAt ?? job.enqueuedAt;
  const elapsedMs = (job.completedAt ?? new Date(now)).getTime() - startedRef.getTime();

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    result: job.resultJson ?? null,
    error: job.errorMessage ?? null,
    elapsedMs: Math.max(0, elapsedMs),
  });
}
