/**
 * Client-side helper for consuming Server-Sent Events (SSE) responses
 * from our admin scenario generation endpoints.
 *
 * The server-side pattern (used by both /generate-task and
 * /extract-criteria) is:
 *   - Validation failures → plain JSON 4xx/5xx responses (no streaming)
 *   - Happy path → `text/event-stream` with periodic `: keepalive`
 *     comments and one terminal event:
 *         event: result   data: <JSON payload>
 *       OR
 *         event: error    data: { error: string }
 *
 * `consumeSseResultStream` parses that shape into a Promise<T>. It
 * throws with a clear message on validation errors, empty bodies (the
 * Lambda-timeout case), non-JSON server errors, or streams that close
 * without a `result` event.
 */

interface SseConsumerOptions {
  /**
   * Optional handler invoked for non-terminal events. Useful if a
   * future endpoint adds progress events; not used today.
   */
  onEvent?: (eventName: string, data: string) => void;
}

export async function consumeSseResultStream<TResult>(
  res: Response,
  options: SseConsumerOptions = {}
): Promise<TResult> {
  const contentType = res.headers.get("content-type") ?? "";

  // Validation / non-2xx — these come back as plain JSON before the
  // server commits to the stream.
  if (!res.ok || !contentType.includes("text/event-stream")) {
    const raw = await res.text().catch(() => "");
    if (!raw) {
      throw new Error(
        `Server returned an empty ${res.ok ? "OK" : "HTTP " + res.status} response. The request may have timed out at the platform — try a shorter input or fewer tasks.`
      );
    }
    let parsed: { error?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        `Server returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`
      );
    }
    throw new Error(parsed.error || `HTTP ${res.status}`);
  }

  if (!res.body) {
    throw new Error("Streaming not supported in this browser.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: TResult | null = null;
  let errorMessage: string | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events end at a blank line (`\n\n`). Comments (heartbeats)
      // start with `:` and are skipped.
      let split: number;
      while ((split = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);

        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of block.split("\n")) {
          if (!line || line.startsWith(":")) continue;
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        }
        if (dataLines.length === 0) continue;
        const dataStr = dataLines.join("\n");

        if (eventName === "result") {
          try {
            result = JSON.parse(dataStr) as TResult;
          } catch {
            errorMessage = "Server returned an unparseable result event.";
          }
        } else if (eventName === "error") {
          try {
            const payload = JSON.parse(dataStr);
            errorMessage =
              (payload as { error?: string })?.error || "Request failed";
          } catch {
            errorMessage = dataStr || "Request failed";
          }
        } else if (options.onEvent) {
          options.onEvent(eventName, dataStr);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (errorMessage) throw new Error(errorMessage);
  if (result === null) {
    throw new Error(
      "Stream ended without a result. The request likely hit the platform timeout — try a shorter input or fewer tasks."
    );
  }
  return result;
}
