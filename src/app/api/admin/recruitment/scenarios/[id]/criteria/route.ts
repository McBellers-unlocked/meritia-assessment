import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertScenarioAccess, requireScenarioBuilder } from "@/lib/admin-auth";

async function access(scenarioId: string) {
  const auth = await requireScenarioBuilder();
  if (!auth.ok) return { response: auth.response } as const;
  const denied = await assertScenarioAccess(auth, scenarioId);
  return denied ? ({ response: denied } as const) : ({ auth } as const);
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const allowed = await access(params.id);
  if ("response" in allowed) return allowed.response;
  const body = await request.json().catch(() => ({}));
  const id = body.id ? String(body.id) : null;
  const code = String(body.code ?? "").trim().toUpperCase().slice(0, 40);
  const name = String(body.name ?? "").trim().slice(0, 200);
  const description = String(body.description ?? "").trim().slice(0, 8_000);
  const sourceRequirement = String(body.sourceRequirement ?? "").trim().slice(0, 8_000) || null;
  const observableBehaviours = Array.isArray(body.observableBehaviours) ? body.observableBehaviours.map(String).map((v: string) => v.trim()).filter(Boolean).slice(0, 20) : [];
  const mappings = Array.isArray(body.mappings) ? body.mappings : [];
  if (!code || !name || !description) return NextResponse.json({ error: "code, name and description required" }, { status: 400 });
  const taskIds = mappings.map((mapping: Record<string, unknown>) => String(mapping.taskId ?? "")).filter(Boolean);
  if (taskIds.length !== mappings.length || new Set(taskIds).size !== taskIds.length) {
    return NextResponse.json({ error: "Each mapping must reference one distinct task." }, { status: 400 });
  }
  if (mappings.some((mapping: Record<string, unknown>) => !String(mapping.expectedCandidateEvidence ?? "").trim())) {
    return NextResponse.json({ error: "Every mapping requires expected candidate evidence." }, { status: 400 });
  }
  const validTasks = await prisma.recruitmentScenarioTask.findMany({ where: { scenarioId: params.id, id: { in: taskIds } }, select: { id: true } });
  if (validTasks.length !== new Set(taskIds).size) return NextResponse.json({ error: "Every mapping must reference a task in this scenario." }, { status: 400 });
  if (id && !(await prisma.recruitmentScenarioCriterion.findFirst({ where: { id, scenarioId: params.id } }))) {
    return NextResponse.json({ error: "Criterion not found" }, { status: 404 });
  }
  const criterion = await prisma.$transaction(async (tx) => {
    const saved = id
      ? await tx.recruitmentScenarioCriterion.update({ where: { id }, data: { code, name, description, sourceRequirement, observableBehaviours: observableBehaviours as Prisma.InputJsonValue } })
      : await tx.recruitmentScenarioCriterion.create({ data: { scenarioId: params.id, code, name, description, sourceRequirement, observableBehaviours: observableBehaviours as Prisma.InputJsonValue, order: await tx.recruitmentScenarioCriterion.count({ where: { scenarioId: params.id } }) } });
    await tx.recruitmentScenarioCriterionTask.deleteMany({ where: { criterionId: saved.id } });
    for (const mapping of mappings as Array<Record<string, unknown>>) {
      await tx.recruitmentScenarioCriterionTask.create({
        data: {
          criterionId: saved.id,
          taskId: String(mapping.taskId),
          expectedCandidateEvidence: String(mapping.expectedCandidateEvidence ?? "").trim().slice(0, 8_000),
          rubricElementIds: (Array.isArray(mapping.rubricElementIds) ? mapping.rubricElementIds.map(String) : []) as Prisma.InputJsonValue,
          marks: Math.max(0, Number(mapping.marks) || 0),
        },
      });
    }
    await tx.recruitmentScenario.update({ where: { id: params.id }, data: { updatedAt: new Date() } });
    return saved;
  });
  return NextResponse.json({ criterion });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const allowed = await access(params.id);
  if ("response" in allowed) return allowed.response;
  const body = await request.json().catch(() => ({}));
  const criterionId = String(body.criterionId ?? "");
  const criterion = await prisma.recruitmentScenarioCriterion.findFirst({ where: { id: criterionId, scenarioId: params.id } });
  if (!criterion) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.recruitmentScenarioCriterion.delete({ where: { id: criterionId } });
  await prisma.recruitmentScenario.update({ where: { id: params.id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
