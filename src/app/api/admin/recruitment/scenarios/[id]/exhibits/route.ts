import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const MAX_EXHIBIT_BYTES = 512 * 1024; // 512 KB of HTML — plenty for a FAM-size exhibit

/**
 * POST /api/admin/recruitment/scenarios/[id]/exhibits
 *   body: { title, html }
 *
 * Creates a new exhibit attached to the scenario. Tasks reference exhibits
 * by id; one exhibit can be shared by multiple memo_ai tasks.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const scenario = await prisma.recruitmentScenario.findUnique({ where: { id: params.id } });
  if (!scenario) return NextResponse.json({ error: "Scenario not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const html = String(body.html ?? "");

  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!html) return NextResponse.json({ error: "html required" }, { status: 400 });
  if (Buffer.byteLength(html, "utf8") > MAX_EXHIBIT_BYTES) {
    return NextResponse.json(
      { error: `html exceeds ${MAX_EXHIBIT_BYTES / 1024} KB limit` },
      { status: 413 }
    );
  }

  const exhibit = await prisma.recruitmentScenarioExhibit.create({
    data: { scenarioId: params.id, title, html },
  });
  await prisma.recruitmentScenario.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ exhibit });
}
