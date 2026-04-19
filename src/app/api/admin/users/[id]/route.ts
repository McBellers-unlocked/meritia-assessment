import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/users/:id — toggle an admin's active flag.
 *   body: { active: boolean }
 *
 * Deactivating blocks future sign-ins (auth.signIn refuses) and strips role
 * from the JWT on the next refresh (auth.jwt callback). We refuse to
 * deactivate the caller or the last active admin to avoid a lockout.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "active: boolean required" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.active === false) {
    if (target.id === auth.session.user.id) {
      return NextResponse.json({ error: "You cannot deactivate yourself" }, { status: 400 });
    }
    if (target.active) {
      const activeAdmins = await prisma.user.count({
        where: { role: "ADMIN", active: true },
      });
      if (activeAdmins <= 1) {
        return NextResponse.json({ error: "Cannot deactivate the last active admin" }, { status: 400 });
      }
    }
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: { active: body.active },
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
  });
  return NextResponse.json({ user: updated });
}
