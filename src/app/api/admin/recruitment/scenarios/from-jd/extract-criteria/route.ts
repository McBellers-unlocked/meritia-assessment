import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { requireAdmin } from "@/lib/admin-auth";
import {
  extractCriteria,
  type ExtractCriteriaInput,
} from "@/lib/recruit/criteria-extractor";

export const dynamic = "force-dynamic";
// Extraction is typically 3–8s on Opus 4.7, but headroom is cheap and
// SSE keeps the connection alive regardless.
export const maxDuration = 60;

/**
 * POST /api/admin/recruitment/scenarios/from-jd/extract-criteria
 *   body: { jdText, positionTitle }
 *
 *   → Server-Sent Events stream:
 *       event: result    data: { essential: string[], desirable: string[], usage: {...} }
 *       event: error     data: { error: string }
 *     plus periodic `: keepalive` comments while the model is running.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));

  const jdText = String(body.jdText ?? "").trim();
  const positionTitle = String(body.positionTitle ?? "").trim();

  if (!jdText) return jsonError("jdText is required", 400);
  if (!positionTitle) return jsonError("positionTitle is required", 400);

  const input: ExtractCriteriaInput = { jdText, positionTitle };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          // Client disconnected mid-stream.
        }
      };

      const sendEvent = (event: string, data: unknown) => {
        safeEnqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
      }, 5000);

      // Push an initial comment so any proxy commits to streaming
      // mode instead of buffering the whole response.
      safeEnqueue(encoder.encode(`: stream-open\n\n`));

      try {
        const { result, usage } = await extractCriteria(input, () => {
          safeEnqueue(encoder.encode(`: tick\n\n`));
        });
        sendEvent("result", {
          essential: result.essential,
          desirable: result.desirable,
          usage: {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
          },
        });
      } catch (e) {
        const message =
          e instanceof Anthropic.RateLimitError
            ? "Anthropic API rate limit hit — try again in a moment."
            : e instanceof Anthropic.APIError
            ? `Anthropic API error: ${e.message}`
            : (e as Error).message || "Criteria extraction failed";
        sendEvent("error", { error: message });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed.
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
      "X-Accel-Buffering": "no",
    },
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
