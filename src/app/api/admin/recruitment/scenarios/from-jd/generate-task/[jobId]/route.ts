import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

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
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const job = await prisma.recruitmentScenarioGenerationJob.findUnique({
    where: { id: params.jobId },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Lock down to the admin who created the job (or any admin — for now
  // any admin can view any job; revisit if multi-tenant).
  // NOTE: requireAdmin already gates to admin role; no per-user check here.

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
