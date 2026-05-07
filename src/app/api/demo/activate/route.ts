import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/demo/activate?t=<token>&dest=<path>
 *
 * Tokenized self-serve sign-in for prospect demos. The token maps to a
 * RecruitmentDemoSession row (which references a DEMO-role User);
 * activation:
 *   1. Validates the token (exists, not expired, not revoked).
 *   2. Mints a NextAuth-compatible session JWT and sets the cookie.
 *   3. Redirects to `dest` (validated against an allow-list prefix to
 *      prevent open-redirect — DEMO users have no business outside the
 *      scenario builder).
 *
 * Default `dest` is the WIPO picker. Subsequent requests carry the
 * cookie and flow through the standard NextAuth machinery; the JWT
 * callback in src/lib/auth.ts re-reads the User row by email on every
 * request, so role changes (e.g. an operator promoting/revoking) take
 * effect immediately.
 *
 * Mint tokens via scripts/mint-demo-session.ts.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("t")?.trim();
  const dest = validateDest(searchParams.get("dest"));

  if (!token) {
    return NextResponse.json(
      { error: "Missing token (?t=...)" },
      { status: 400 }
    );
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Server misconfigured: NEXTAUTH_SECRET missing" },
      { status: 500 }
    );
  }

  const session = await prisma.recruitmentDemoSession.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) {
    return demoErrorPage(
      "This demo link is invalid.",
      "Ask the operator to issue a new one."
    );
  }
  if (session.revokedAt) {
    return demoErrorPage(
      "This demo link has been revoked.",
      "Ask the operator to issue a new one."
    );
  }
  if (session.expiresAt.getTime() < Date.now()) {
    return demoErrorPage(
      "This demo link has expired.",
      `Expired ${session.expiresAt.toISOString().slice(0, 10)}. Ask the operator to issue a new one.`
    );
  }
  if (session.user.role !== "DEMO") {
    // Defensive — the mint script always pairs DemoSession with a DEMO
    // User. If something flipped the role to ADMIN, refuse to issue a
    // session that would silently grant full admin via this URL path.
    return demoErrorPage(
      "This demo link cannot be used.",
      "The linked account no longer has demo permissions."
    );
  }

  // Cap the session lifetime at the DemoSession expiry so a leaked
  // cookie can't outlive the link itself. NextAuth's default is 30
  // days; we shorten it here.
  const maxAgeSeconds = Math.max(
    60,
    Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
  );

  const jwt = await encode({
    token: {
      sub: session.user.id,
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? session.name,
      role: session.user.role,
    },
    secret,
    maxAge: maxAgeSeconds,
  });

  // Derive the *public* origin from forwarded headers (Amplify sits
  // behind a load balancer, and request.url can reflect the internal
  // Lambda hostname). NEXTAUTH_URL is checked too, but only if it's
  // an https URL — a stale localhost value (common leftover from
  // dev .env files) would otherwise redirect the user to localhost
  // and trigger a browser SSL error.
  const origin = publicOrigin(request);
  const isSecureScheme = origin.startsWith("https://");

  // Cookie name has to match NextAuth's convention so getServerSession
  // picks it up on subsequent requests. The `__Secure-` prefix is
  // mandatory when the cookie has the Secure flag.
  const cookieName = isSecureScheme
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

  const response = NextResponse.redirect(`${origin}${dest}`);
  response.cookies.set(cookieName, jwt, {
    httpOnly: true,
    secure: isSecureScheme,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
  return response;
}

/**
 * Resolve the public origin of the current request. Order:
 *   1. NEXTAUTH_URL — only when it's an https URL. A localhost value
 *      (left over from a copied .env.local) is ignored.
 *   2. x-forwarded-host + x-forwarded-proto — set by Amplify's load
 *      balancer.
 *   3. request.nextUrl.origin — last-resort fallback for local dev.
 */
function publicOrigin(request: NextRequest): string {
  const env = process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  if (env && env.startsWith("https://")) return env;

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    const proto = forwardedProto ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return request.nextUrl.origin;
}

const ALLOWED_DEST_PREFIXES = ["/admin/recruitment/scenarios"];
const DEFAULT_DEST = "/admin/recruitment/scenarios/new/from-wipo";

function validateDest(raw: string | null): string {
  if (!raw) return DEFAULT_DEST;
  if (!raw.startsWith("/")) return DEFAULT_DEST;
  if (raw.startsWith("//")) return DEFAULT_DEST; // protocol-relative
  if (!ALLOWED_DEST_PREFIXES.some((p) => raw.startsWith(p))) {
    return DEFAULT_DEST;
  }
  return raw;
}

function demoErrorPage(title: string, detail: string): NextResponse {
  // Plain HTML so a clicked link from email opens directly to a
  // human-readable page, not a JSON blob.
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>UNIQAssess demo link</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; margin: 0; padding: 4rem 1rem; color: #1B2A4A; }
    .card { max-width: 32rem; margin: 0 auto; background: white; border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    h1 { margin: 0 0 0.5rem; font-size: 1.25rem; }
    p { margin: 0 0 0.5rem; color: #475569; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(detail)}</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 410,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
