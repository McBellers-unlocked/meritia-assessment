import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * GET  /api/admin/recruitment/scenarios            — list all scenarios
 * GET  /api/admin/recruitment/scenarios?status=published   — filter by status
 * POST /api/admin/recruitment/scenarios            — create empty draft scenario
 *   body: { title, slug, organisation, positionTitle, defaultTotalMinutes? }
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const status = request.nextUrl.searchParams.get("status");
  const scenarios = await prisma.recruitmentScenario.findMany({
    where: status ? { status } : undefined,
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { tasks: true, assessments: true } },
    },
  });

  return NextResponse.json({
    scenarios: scenarios.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      organisation: s.organisation,
      positionTitle: s.positionTitle,
      defaultTotalMinutes: s.defaultTotalMinutes,
      status: s.status,
      publishedAt: s.publishedAt,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      taskCount: s._count.tasks,
      assessmentCount: s._count.assessments,
    })),
  });
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const slug = String(body.slug ?? "").trim().toLowerCase();
  const organisation = String(body.organisation ?? "").trim();
  const positionTitle = String(body.positionTitle ?? "").trim();
  const defaultTotalMinutes = Number(body.defaultTotalMinutes ?? 90);

  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "slug must be lowercase letters, numbers and single hyphens (e.g. fam-p4)" },
      { status: 400 }
    );
  }
  if (!organisation) return NextResponse.json({ error: "organisation required" }, { status: 400 });
  if (!positionTitle) return NextResponse.json({ error: "positionTitle required" }, { status: 400 });
  if (!Number.isFinite(defaultTotalMinutes) || defaultTotalMinutes < 5 || defaultTotalMinutes > 480) {
    return NextResponse.json({ error: "defaultTotalMinutes must be between 5 and 480" }, { status: 400 });
  }

  // Slug collision — include hardcoded slugs that would clash with
  // /assess/<slug> routing (built-in code-based scenarios).
  const RESERVED_SLUGS = new Set(["fam-p4", "aplo-p2"]);
  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.json({ error: "slug is reserved by a built-in scenario" }, { status: 409 });
  }
  const existing = await prisma.recruitmentScenario.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "slug already in use" }, { status: 409 });
  }

  const created = await prisma.recruitmentScenario.create({
    data: {
      title,
      slug,
      organisation,
      positionTitle,
      defaultTotalMinutes,
      createdById: auth.session.user.id,
    },
  });

  return NextResponse.json({ scenario: created });
}
