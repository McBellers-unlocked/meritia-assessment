/**
 * Lightweight structured logger. Shape-standardises console.log so every line
 * carries a timestamp + level + (when the caller passes request headers) the
 * `x-request-id` stamped by `src/middleware.ts`.
 *
 * Deliberately NOT pino or any other full logger — we just want one JSON line
 * per event that Amplify CloudWatch can pick up. Swap in a real logger later
 * if we need sampling, redaction, or transports.
 *
 * Usage in an API handler:
 *   import { log } from "@/lib/log";
 *
 *   export async function POST(request: NextRequest) {
 *     log.info(request.headers, "assessment.create", { title });
 *     try {
 *       ...
 *     } catch (err) {
 *       log.error(request.headers, "assessment.create.failed", { err: String(err) });
 *       throw err;
 *     }
 *   }
 */

type Level = "info" | "warn" | "error";
type Ctx = Record<string, unknown>;

// Accept anything with a `.get(key)` method (NextRequest.headers, standard
// Headers, Next's Route Handler req.headers()). Undefined is allowed so
// non-HTTP callers (background jobs, seed scripts) can still use the logger.
export type LogHeaders = Pick<Headers, "get"> | undefined;

function requestIdFrom(headers: LogHeaders): string | undefined {
  if (!headers) return undefined;
  return headers.get("x-request-id") ?? undefined;
}

function emit(level: Level, headers: LogHeaders, msg: string, ctx?: Ctx) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    level,
    msg,
    requestId: requestIdFrom(headers),
    ...(ctx ?? {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (headers: LogHeaders, msg: string, ctx?: Ctx) => emit("info", headers, msg, ctx),
  warn: (headers: LogHeaders, msg: string, ctx?: Ctx) => emit("warn", headers, msg, ctx),
  error: (headers: LogHeaders, msg: string, ctx?: Ctx) => emit("error", headers, msg, ctx),
};
