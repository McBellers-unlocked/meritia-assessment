import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { enqueueGenerationJob } from "@/lib/recruit/sqs-client";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/recruitment/scenarios/from-jd/generate-task
 *   body: { jdText, positionTitle, organisation, focusCriteria, taskIndex, taskCount, priorThemes }
 *   → { jobId }
 *
 * Kicks off a background generation. Inserts a row in
 * RecruitmentScenarioGenerationJob (status="queued") and posts an SQS
 * message; the worker Lambda picks it up, calls Anthropic, and writes
 * the result back. Wizard polls
 * GET /generate-task/[jobId] until status flips to completed/failed.
 *
 * The previous version of this endpoint called Anthropic directly and
 * was strangled by Amplify Hosting's fixed ~30s SSR Lambda timeout on
 * complex multi-criteria generations. The new architecture moves the
 * long call out of the SSR boundary entirely.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));

  const jdText = String(body.jdText ?? "").trim();
  const positionTitle = String(body.positionTitle ?? "").trim();
  const organisation = String(body.organisation ?? "").trim();
  const focusCriteria = Array.isArray(body.focusCriteria)
    ? body.focusCriteria
        .map((c: unknown) => String(c).trim())
        .filter(Boolean)
    : [];
  const taskIndex = Number(body.taskIndex);
  const taskCount = Number(body.taskCount);
  const priorThemes = Array.isArray(body.priorThemes)
    ? body.priorThemes.map((t: unknown) => String(t)).filter(Boolean)
    : [];

  if (!jdText) return jsonError("jdText is required", 400);
  if (!positionTitle) return jsonError("positionTitle is required", 400);
  if (!organisation) return jsonError("organisation is required", 400);
  if (!focusCriteria.length) return jsonError("focusCriteria must be non-empty", 400);
  if (
    !Number.isInteger(taskIndex) ||
    !Number.isInteger(taskCount) ||
    taskIndex < 1 ||
    taskCount < 1 ||
    taskCount > 5 ||
    taskIndex > taskCount
  ) {
    return jsonError("taskIndex/taskCount invalid (taskCount must be 1–5)", 400);
  }

  // Persist the job, then send to SQS. Worth the two-step: a failed
  // SQS send leaves a "queued" row that won't be picked up — easier to
  // observe and reap than a phantom message with no DB row.
  const job = await prisma.recruitmentScenarioGenerationJob.create({
    data: {
      createdById: auth.session.user.id,
      status: "queued",
      inputJson: {
        jdText,
        positionTitle,
        organisation,
        focusCriteria,
        taskIndex,
        taskCount,
        priorThemes,
      },
    },
  });

  try {
    await enqueueGenerationJob(job.id);
  } catch (e) {
    // Mark the orphan as failed so the wizard's poll surfaces it
    // immediately instead of waiting indefinitely.
    await prisma.recruitmentScenarioGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorMessage: `Failed to enqueue: ${(e as Error).message}`,
        completedAt: new Date(),
      },
    });
    return jsonError(
      `Could not queue generation job: ${(e as Error).message}`,
      502
    );
  }

  return NextResponse.json({ jobId: job.id });
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
