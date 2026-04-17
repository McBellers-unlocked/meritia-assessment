import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const VALID_ACTIONS = ["reply", "ignore", "flag", "forward"] as const;

/**
 * POST /api/admin/recruitment/scenarios/[id]/tasks/[taskId]/emails
 *   body: { triggerOffsetSeconds, senderName, senderEmail, subject, bodyHtml,
 *           expectedAction, markerNotes?, orderIndex? }
 *
 * Adds a scripted email to an email_inbox task. The task's kind is enforced
 * so admins can't accidentally drop emails onto a memo_ai task.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; taskId: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const task = await prisma.recruitmentScenarioTask.findUnique({ where: { id: params.taskId } });
  if (!task || task.scenarioId !== params.id) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (task.kind !== "email_inbox") {
    return NextResponse.json({ error: "Task is not an email_inbox task" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const triggerOffsetSeconds = Number(body.triggerOffsetSeconds);
  const senderName = String(body.senderName ?? "").trim();
  const senderEmail = String(body.senderEmail ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const bodyHtml = String(body.bodyHtml ?? "");
  const expectedAction = String(body.expectedAction ?? "reply");
  const markerNotes = body.markerNotes ? String(body.markerNotes) : null;

  if (!Number.isFinite(triggerOffsetSeconds) || triggerOffsetSeconds < 0) {
    return NextResponse.json({ error: "triggerOffsetSeconds must be >= 0" }, { status: 400 });
  }
  if (!senderName) return NextResponse.json({ error: "senderName required" }, { status: 400 });
  if (!senderEmail) return NextResponse.json({ error: "senderEmail required" }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "subject required" }, { status: 400 });
  if (!bodyHtml) return NextResponse.json({ error: "bodyHtml required" }, { status: 400 });
  if (!VALID_ACTIONS.includes(expectedAction as typeof VALID_ACTIONS[number])) {
    return NextResponse.json({ error: `expectedAction must be one of ${VALID_ACTIONS.join(", ")}` }, { status: 400 });
  }

  let orderIndex = Number(body.orderIndex);
  if (!Number.isFinite(orderIndex)) {
    const agg = await prisma.recruitmentScenarioEmail.aggregate({
      where: { taskId: task.id },
      _max: { orderIndex: true },
    });
    orderIndex = (agg._max.orderIndex ?? -1) + 1;
  }

  const email = await prisma.recruitmentScenarioEmail.create({
    data: {
      scenarioId: params.id,
      taskId: task.id,
      orderIndex,
      triggerOffsetSeconds,
      senderName,
      senderEmail,
      subject,
      bodyHtml,
      expectedAction,
      markerNotes,
    },
  });
  await prisma.recruitmentScenario.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ email });
}
