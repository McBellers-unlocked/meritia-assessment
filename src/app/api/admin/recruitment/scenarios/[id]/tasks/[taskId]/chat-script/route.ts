import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * PUT  /api/admin/recruitment/scenarios/[id]/tasks/[taskId]/chat-script
 *      Upserts the (single) chat script for a chat task.
 *      body: { triggerOffsetSeconds, personaName, personaRole,
 *              openerMessage, systemPrompt, maxTurns?, expectedOutcomes? }
 *
 * A chat task has exactly one script (1:1). Using PUT makes the upsert
 * semantics explicit — if it doesn't exist we create it, otherwise we
 * overwrite. No DELETE endpoint: deleting the script = delete the task.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; taskId: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const task = await prisma.recruitmentScenarioTask.findUnique({ where: { id: params.taskId } });
  if (!task || task.scenarioId !== params.id) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (task.kind !== "chat") {
    return NextResponse.json({ error: "Task is not a chat task" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const triggerOffsetSeconds = Number(body.triggerOffsetSeconds);
  const personaName = String(body.personaName ?? "").trim();
  const personaRole = String(body.personaRole ?? "").trim();
  const openerMessage = String(body.openerMessage ?? "").trim();
  const systemPrompt = String(body.systemPrompt ?? "").trim();
  const maxTurns = Number.isFinite(body.maxTurns) ? Number(body.maxTurns) : 8;
  const expectedOutcomes = body.expectedOutcomes ? String(body.expectedOutcomes) : null;

  if (!Number.isFinite(triggerOffsetSeconds) || triggerOffsetSeconds < 0) {
    return NextResponse.json({ error: "triggerOffsetSeconds must be >= 0" }, { status: 400 });
  }
  if (!personaName) return NextResponse.json({ error: "personaName required" }, { status: 400 });
  if (!personaRole) return NextResponse.json({ error: "personaRole required" }, { status: 400 });
  if (!openerMessage) return NextResponse.json({ error: "openerMessage required" }, { status: 400 });
  if (!systemPrompt) return NextResponse.json({ error: "systemPrompt required" }, { status: 400 });
  if (maxTurns < 1 || maxTurns > 30) {
    return NextResponse.json({ error: "maxTurns must be 1-30" }, { status: 400 });
  }

  const existing = await prisma.recruitmentScenarioChatScript.findFirst({
    where: { taskId: task.id },
  });

  const script = existing
    ? await prisma.recruitmentScenarioChatScript.update({
        where: { id: existing.id },
        data: {
          triggerOffsetSeconds,
          personaName,
          personaRole,
          openerMessage,
          systemPrompt,
          maxTurns,
          expectedOutcomes,
        },
      })
    : await prisma.recruitmentScenarioChatScript.create({
        data: {
          scenarioId: params.id,
          taskId: task.id,
          triggerOffsetSeconds,
          personaName,
          personaRole,
          openerMessage,
          systemPrompt,
          maxTurns,
          expectedOutcomes,
        },
      });

  await prisma.recruitmentScenario.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ script });
}
