import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const VALID_ACTIONS = ["reply", "ignore", "flag", "forward"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; taskId: string; emailId: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const email = await prisma.recruitmentScenarioEmail.findUnique({ where: { id: params.emailId } });
  if (!email || email.scenarioId !== params.id || email.taskId !== params.taskId) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (body.triggerOffsetSeconds !== undefined) {
    const v = Number(body.triggerOffsetSeconds);
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: "triggerOffsetSeconds must be >= 0" }, { status: 400 });
    }
    data.triggerOffsetSeconds = v;
  }
  if (body.senderName !== undefined) data.senderName = String(body.senderName).trim();
  if (body.senderEmail !== undefined) data.senderEmail = String(body.senderEmail).trim();
  if (body.subject !== undefined) data.subject = String(body.subject).trim();
  if (body.bodyHtml !== undefined) data.bodyHtml = String(body.bodyHtml);
  if (body.expectedAction !== undefined) {
    const v = String(body.expectedAction);
    if (!VALID_ACTIONS.includes(v as typeof VALID_ACTIONS[number])) {
      return NextResponse.json({ error: `expectedAction must be one of ${VALID_ACTIONS.join(", ")}` }, { status: 400 });
    }
    data.expectedAction = v;
  }
  if (body.markerNotes !== undefined) {
    data.markerNotes = body.markerNotes === null ? null : String(body.markerNotes);
  }
  if (body.orderIndex !== undefined) {
    const v = Number(body.orderIndex);
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: "orderIndex must be >= 0" }, { status: 400 });
    }
    data.orderIndex = v;
  }

  const updated = await prisma.recruitmentScenarioEmail.update({
    where: { id: params.emailId },
    data,
  });
  await prisma.recruitmentScenario.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ email: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; taskId: string; emailId: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const email = await prisma.recruitmentScenarioEmail.findUnique({ where: { id: params.emailId } });
  if (!email || email.scenarioId !== params.id || email.taskId !== params.taskId) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  await prisma.recruitmentScenarioEmail.delete({ where: { id: params.emailId } });
  await prisma.recruitmentScenario.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
