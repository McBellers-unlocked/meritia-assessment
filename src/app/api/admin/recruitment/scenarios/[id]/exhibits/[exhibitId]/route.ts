import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const MAX_EXHIBIT_BYTES = 512 * 1024;

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; exhibitId: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const existing = await prisma.recruitmentScenarioExhibit.findUnique({
    where: { id: params.exhibitId },
  });
  if (!existing || existing.scenarioId !== params.id) {
    return NextResponse.json({ error: "Exhibit not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const v = String(body.title).trim();
    if (!v) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    data.title = v;
  }
  if (body.html !== undefined) {
    const v = String(body.html);
    if (!v) return NextResponse.json({ error: "html cannot be empty" }, { status: 400 });
    if (Buffer.byteLength(v, "utf8") > MAX_EXHIBIT_BYTES) {
      return NextResponse.json(
        { error: `html exceeds ${MAX_EXHIBIT_BYTES / 1024} KB limit` },
        { status: 413 }
      );
    }
    data.html = v;
  }

  const exhibit = await prisma.recruitmentScenarioExhibit.update({
    where: { id: params.exhibitId },
    data,
  });
  await prisma.recruitmentScenario.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ exhibit });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; exhibitId: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const existing = await prisma.recruitmentScenarioExhibit.findUnique({
    where: { id: params.exhibitId },
  });
  if (!existing || existing.scenarioId !== params.id) {
    return NextResponse.json({ error: "Exhibit not found" }, { status: 404 });
  }

  // Unlink from any tasks that reference it (onDelete: SetNull handles this,
  // but we surface the count so the admin can immediately tell which tasks
  // are now missing an exhibit).
  const affected = await prisma.recruitmentScenarioTask.count({
    where: { exhibitId: params.exhibitId },
  });
  await prisma.recruitmentScenarioExhibit.delete({ where: { id: params.exhibitId } });
  await prisma.recruitmentScenario.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true, unlinkedTasks: affected });
}
