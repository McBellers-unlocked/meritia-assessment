/**
 * Tiny helper for admin-gated route handlers. Returns either { ok: false,
 * response } so the caller can `return response`, or { ok: true, session }.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/constants";

export type AdminSession = Awaited<ReturnType<typeof getServerSession<typeof authOptions>>>;

export async function requireAdmin(): Promise<
  | { ok: true; session: NonNullable<AdminSession> }
  | { ok: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const role = (session.user as { role?: string }).role;
  if (!role || !(ADMIN_ROLES as readonly string[]).includes(role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, session };
}
