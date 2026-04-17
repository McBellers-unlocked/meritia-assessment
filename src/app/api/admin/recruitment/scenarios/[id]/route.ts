import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * GET    /api/admin/recruitment/scenarios/[id]   — full scenario + children
 * PATCH  /api/admin/recruitment/scenarios/[id]   — update header fields
 * DELETE /api/admin/recruitment/scenarios/[id]   — delete (only if no assessments reference it)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const scenario = await prisma.recruitmentScenario.findUnique({
    where: { id: params.id },
    include: {
      tasks: {
        orderBy: { number: "asc" },
        include: {
          exhibit: true,
          emails: { orderBy: { orderIndex: "asc" } },
          chatScripts: true,
        },
      },
      exhibits: { orderBy: { title: "asc" } },
      _count: { select: { assessments: true } },
    },
  });
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ scenario });
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const existing = await prisma.recruitmentScenario.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const v = String(body.title).trim();
    if (!v) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    data.title = v;
  }
  if (body.slug !== undefined) {
    const v = String(body.slug).trim().toLowerCase();
    if (!SLUG_RE.test(v)) return NextResponse.json({ error: "invalid slug" }, { status: 400 });
    if (v !== existing.slug) {
      // If already published and in use, renaming the slug would break
      // candidate URLs mid-flight. Block it.
      if (existing.status === "published" && existing.publishedAt) {
        const inUse = await prisma.recruitmentAssessment.count({
          where: { customScenarioId: existing.id },
        });
        if (inUse > 0) {
          return NextResponse.json(
            { error: "cannot change slug: scenario is in use by one or more assessments" },
            { status: 409 }
          );
        }
      }
      const clash = await prisma.recruitmentScenario.findUnique({ where: { slug: v } });
      if (clash) return NextResponse.json({ error: "slug already in use" }, { status: 409 });
    }
    data.slug = v;
  }
  if (body.organisation !== undefined) data.organisation = String(body.organisation).trim();
  if (body.positionTitle !== undefined) data.positionTitle = String(body.positionTitle).trim();
  if (body.defaultTotalMinutes !== undefined) {
    const v = Number(body.defaultTotalMinutes);
    if (!Number.isFinite(v) || v < 5 || v > 480) {
      return NextResponse.json({ error: "defaultTotalMinutes must be between 5 and 480" }, { status: 400 });
    }
    data.defaultTotalMinutes = v;
  }

  // Status changes flow through /publish and /archive endpoints — do not
  // accept them on the generic PATCH.
  if (body.status !== undefined) {
    return NextResponse.json({ error: "use /publish to change status" }, { status: 400 });
  }

  const updated = await prisma.recruitmentScenario.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ scenario: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const inUse = await prisma.recruitmentAssessment.count({
    where: { customScenarioId: params.id },
  });
  if (inUse > 0) {
    return NextResponse.json(
      { error: `cannot delete: ${inUse} assessment(s) reference this scenario. Archive it instead.` },
      { status: 409 }
    );
  }

  // Cascade via schema handles tasks/exhibits/emails/chatScripts.
  await prisma.recruitmentScenario.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
