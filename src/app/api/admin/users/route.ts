import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users — list admin accounts.
 *
 * Admins are auto-created on first Cognito sign-in (src/lib/auth.ts signIn
 * callback). This endpoint surfaces them for review + deactivation via PATCH.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ users, currentUserId: auth.session.user.id });
}
