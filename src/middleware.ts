import { NextRequest, NextResponse } from "next/server";

/**
 * Request-id + start-log middleware.
 *
 * Trusts an inbound `x-request-id` (e.g. from a load balancer) when it looks
 * safe; otherwise generates one. The id is forwarded to the handler via a
 * request header rewrite and echoed on the response so callers can correlate
 * logs with client-side errors.
 *
 * We intentionally log only at request start — Next 14 middleware has no
 * post-handler hook, so duration has to be emitted by the handler via
 * `@/lib/log`. This is deliberate: keep middleware edge-cheap, keep the
 * logger shape consistent.
 */

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function newRequestId(): string {
  return crypto.randomUUID();
}

export function middleware(request: NextRequest) {
  const incoming = request.headers.get("x-request-id");
  const requestId = incoming && SAFE_ID.test(incoming) ? incoming : newRequestId();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      level: "info",
      msg: "request.start",
      requestId,
      method: request.method,
      path: request.nextUrl.pathname,
    })
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  // Match everything except Next internals and file-based metadata assets.
  // Static assets under /public (e.g. /brand/**) are also excluded to keep
  // the middleware off the hot path for images.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon\\.png|opengraph-image\\.png|brand/).*)",
  ],
};
