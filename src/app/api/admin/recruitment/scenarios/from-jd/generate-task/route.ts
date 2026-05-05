import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { requireAdmin } from "@/lib/admin-auth";
import {
  generateOneTask,
  type GenerateTaskInput,
} from "@/lib/recruit/scenario-generator";

export const dynamic = "force-dynamic";
// Single Opus 4.7 call with adaptive thinking + a long exhibit can run for
// 30–60s. Lambda/Vercel default is 10s; bump to 90s with headroom.
export const maxDuration = 90;

/**
 * POST /api/admin/recruitment/scenarios/from-jd/generate-task
 *   body: {
 *     jdText, positionTitle, organisation,
 *     taskIndex, taskCount, priorThemes
 *   }
 *   → { task: GeneratedTaskDraft, usage }
 *
 * Used both for the initial fan-out (called N times by the wizard) and for
 * per-task Regenerate clicks — same endpoint, different inputs. Nothing is
 * written to the DB; the client holds the drafts in state until Save.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));

  const jdText = String(body.jdText ?? "").trim();
  const positionTitle = String(body.positionTitle ?? "").trim();
  const organisation = String(body.organisation ?? "").trim();
  const taskIndex = Number(body.taskIndex);
  const taskCount = Number(body.taskCount);
  const priorThemes = Array.isArray(body.priorThemes)
    ? body.priorThemes.map((t: unknown) => String(t)).filter(Boolean)
    : [];

  if (!jdText) {
    return NextResponse.json({ error: "jdText is required" }, { status: 400 });
  }
  if (!positionTitle) {
    return NextResponse.json(
      { error: "positionTitle is required" },
      { status: 400 }
    );
  }
  if (!organisation) {
    return NextResponse.json(
      { error: "organisation is required" },
      { status: 400 }
    );
  }
  if (
    !Number.isInteger(taskIndex) ||
    !Number.isInteger(taskCount) ||
    taskIndex < 1 ||
    taskCount < 1 ||
    taskCount > 5 ||
    taskIndex > taskCount
  ) {
    return NextResponse.json(
      { error: "taskIndex/taskCount invalid (taskCount must be 1–5)" },
      { status: 400 }
    );
  }

  const input: GenerateTaskInput = {
    jdText,
    positionTitle,
    organisation,
    taskIndex,
    taskCount,
    priorThemes,
  };

  try {
    const result = await generateOneTask(input);
    return NextResponse.json({
      task: result.task,
      usage: {
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        cache_creation_input_tokens:
          result.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: result.usage.cache_read_input_tokens ?? 0,
      },
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Anthropic API rate limit hit — try again in a moment." },
        { status: 429 }
      );
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Anthropic API error: ${e.message}` },
        { status: e.status ?? 500 }
      );
    }
    return NextResponse.json(
      { error: (e as Error).message || "Generation failed" },
      { status: 500 }
    );
  }
}
