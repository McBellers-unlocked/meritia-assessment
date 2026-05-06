import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { requireAdmin } from "@/lib/admin-auth";
import {
  generateOneTask,
  type GenerateTaskInput,
} from "@/lib/recruit/scenario-generator";

export const dynamic = "force-dynamic";
// Single Opus 4.7 generation can run 30–60s. We respond as Server-Sent
// Events so heartbeats keep CloudFront / Amplify's gateway from giving
// up while the model is still producing tokens. Lambda's own timeout is
// configured at the Amplify app level — bump it past 60s if generations
// keep landing in error.
export const maxDuration = 90;

/**
 * POST /api/admin/recruitment/scenarios/from-jd/generate-task
 *   body: { jdText, positionTitle, organisation, taskIndex, taskCount, priorThemes }
 *
 *   → Server-Sent Events stream, with two terminal events:
 *       event: result    data: { task: GeneratedTaskDraft, usage: {...} }
 *       event: error     data: { error: string }
 *     plus periodic `: keepalive` comments while the model is generating.
 *
 * The streaming response keeps the connection alive on Amplify/CloudFront
 * while the underlying Anthropic call runs to completion. The full task
 * is sent in one `result` event — we don't stream partial JSON to the
 * client because `tool_use.input` is only valid once complete.
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

  const validation = validateInput({
    jdText,
    positionTitle,
    organisation,
    taskIndex,
    taskCount,
  });
  if (validation) {
    return jsonError(validation, 400);
  }

  const input: GenerateTaskInput = {
    jdText,
    positionTitle,
    organisation,
    taskIndex,
    taskCount,
    priorThemes,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          // Client disconnected mid-stream — nothing to do.
        }
      };

      const sendEvent = (event: string, data: unknown) => {
        safeEnqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Periodic SSE comment — invisible to the parser, but proves to
      // CloudFront that the connection is still progressing.
      const heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
      }, 5000);

      // First heartbeat goes out immediately so any proxy in front of us
      // commits to streaming mode rather than buffering the response.
      safeEnqueue(encoder.encode(`: stream-open\n\n`));

      try {
        const result = await generateOneTask(input, () => {
          // The Anthropic SDK fires events frequently — piggyback on
          // them as additional liveness signals. The 5s heartbeat is
          // enough on its own; this is belt-and-braces.
          safeEnqueue(encoder.encode(`: tick\n\n`));
        });
        sendEvent("result", {
          task: result.task,
          usage: {
            input_tokens: result.usage.input_tokens,
            output_tokens: result.usage.output_tokens,
            cache_creation_input_tokens:
              result.usage.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens:
              result.usage.cache_read_input_tokens ?? 0,
          },
        });
      } catch (e) {
        const message =
          e instanceof Anthropic.RateLimitError
            ? "Anthropic API rate limit hit — try again in a moment."
            : e instanceof Anthropic.APIError
            ? `Anthropic API error: ${e.message}`
            : (e as Error).message || "Generation failed";
        sendEvent("error", { error: message });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Some proxies (notably nginx, sometimes CloudFront) buffer
      // responses by default. This header asks them not to.
      "X-Accel-Buffering": "no",
    },
  });
}

function validateInput({
  jdText,
  positionTitle,
  organisation,
  taskIndex,
  taskCount,
}: {
  jdText: string;
  positionTitle: string;
  organisation: string;
  taskIndex: number;
  taskCount: number;
}): string | null {
  if (!jdText) return "jdText is required";
  if (!positionTitle) return "positionTitle is required";
  if (!organisation) return "organisation is required";
  if (
    !Number.isInteger(taskIndex) ||
    !Number.isInteger(taskCount) ||
    taskIndex < 1 ||
    taskCount < 1 ||
    taskCount > 5 ||
    taskIndex > taskCount
  ) {
    return "taskIndex/taskCount invalid (taskCount must be 1–5)";
  }
  return null;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
