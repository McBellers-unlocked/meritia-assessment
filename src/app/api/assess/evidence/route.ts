import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadCandidate, verifySessionCookie } from "@/lib/recruit/candidate-auth";
import { getScenarioForAssessment } from "@/lib/recruit/scenario-loader";
import type { KnowledgeSystemResponse } from "@/lib/recruit/knowledge-response-schema";
import { candidateOwnedInteractionWhere, candidateOwnedRecordWhere } from "@/lib/recruit/candidate-record-scope";
import { isMemoAiTask } from "@/lib/recruit/types";

export const dynamic = "force-dynamic";

async function authenticated(token: string) {
  const result = await loadCandidate(token);
  if (!result.ok) return { response: NextResponse.json({ error: result.error }, { status: result.status }) } as const;
  if (result.candidate.status !== "started") return { response: NextResponse.json({ error: "The main assessment workspace is locked." }, { status: 400 }) } as const;
  if (!(await verifySessionCookie(result.candidate))) return { response: NextResponse.json({ error: "Session mismatch." }, { status: 403 }) } as const;
  return { result } as const;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();
  const interactionId = String(body.interactionId ?? "").trim();
  const evidenceCardId = String(body.evidenceCardId ?? "").trim();
  const auth = await authenticated(token);
  if ("response" in auth) return auth.response;
  const { candidate, assessment } = auth.result;
  if (body.action === "source_opened") {
    const taskNumber = Number(body.taskNumber);
    const sourceId = String(body.sourceId ?? "").trim();
    const scenario = await getScenarioForAssessment(assessment);
    const task = scenario?.tasks.find((item) => item.number === taskNumber);
    if (!task || !isMemoAiTask(task) || !sourceId || task.exhibitSourceId !== sourceId) {
      return NextResponse.json({ error: "Source ownership could not be verified." }, { status: 400 });
    }
    await prisma.recruitmentActivityEvent.create({
      data: { candidateId: candidate.id, eventType: "source_opened", taskNumber, metadata: { evidenceCardId, sourceId } },
    });
    return NextResponse.json({ ok: true });
  }
  if (!interactionId || !evidenceCardId) return NextResponse.json({ error: "interactionId and evidenceCardId required" }, { status: 400 });
  const interaction = await prisma.recruitmentInteraction.findFirst({
    where: candidateOwnedInteractionWhere(candidate.id, interactionId),
    select: { id: true, taskNumber: true, structuredPayload: true },
  });
  if (!interaction?.structuredPayload) return NextResponse.json({ error: "Evidence card is not part of this candidate session." }, { status: 404 });
  const payload = interaction.structuredPayload as unknown as KnowledgeSystemResponse;
  const card = Array.isArray(payload.evidenceCards) ? payload.evidenceCards.find((item) => item.id === evidenceCardId) : null;
  if (!card) return NextResponse.json({ error: "Evidence card not found in the interaction." }, { status: 404 });
  const scenario = await getScenarioForAssessment(assessment);
  const task = scenario?.tasks.find((item) => item.number === interaction.taskNumber);
  if (!task) return NextResponse.json({ error: "Task ownership could not be verified." }, { status: 400 });
  const status = card.verificationStatus === "verified" ? "VERIFIED" : card.verificationStatus === "inference" ? "INFERENCE" : "UNVERIFIED";
  const evidence = await prisma.recruitmentCandidateEvidence.upsert({
    where: { candidateId_interactionId_evidenceCardId: { candidateId: candidate.id, interactionId: interaction.id, evidenceCardId } },
    create: {
      candidateId: candidate.id, taskId: task.taskId ?? null, taskNumber: interaction.taskNumber,
      interactionId: interaction.id, evidenceCardId, claim: card.claim,
      sourceId: card.sourceId, sourceTitle: card.sourceTitle, sourceExcerpt: card.sourceExcerpt,
      sourceVerificationStatus: status,
      candidateDisposition: "SAVED",
    },
    update: { candidateDisposition: "SAVED" },
  });
  await prisma.recruitmentActivityEvent.create({
    data: { candidateId: candidate.id, eventType: "evidence_saved", taskNumber: interaction.taskNumber, metadata: { evidenceId: evidence.id, evidenceCardId } },
  });
  return NextResponse.json({ evidence });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();
  const id = String(body.id ?? "").trim();
  const disposition = String(body.disposition ?? "").toUpperCase();
  if (!id || !["SAVED", "CHECKED", "REJECTED", "DISMISSED"].includes(disposition)) {
    return NextResponse.json({ error: "id and valid disposition required" }, { status: 400 });
  }
  const auth = await authenticated(token);
  if ("response" in auth) return auth.response;
  const current = await prisma.recruitmentCandidateEvidence.findFirst({ where: candidateOwnedRecordWhere(auth.result.candidate.id, id) });
  if (!current) return NextResponse.json({ error: "Evidence item not found." }, { status: 404 });
  const evidence = await prisma.recruitmentCandidateEvidence.update({ where: { id }, data: { candidateDisposition: disposition as "SAVED" | "CHECKED" | "REJECTED" | "DISMISSED" } });
  const eventType = disposition === "CHECKED"
    ? "evidence_checked"
    : disposition === "SAVED"
      ? "evidence_saved"
      : disposition === "DISMISSED"
        ? "evidence_dismissed"
        : "evidence_rejected";
  await prisma.recruitmentActivityEvent.create({ data: { candidateId: auth.result.candidate.id, eventType, taskNumber: current.taskNumber, metadata: { evidenceId: id } } });
  return NextResponse.json({ evidence });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();
  const id = String(body.id ?? "").trim();
  const auth = await authenticated(token);
  if ("response" in auth) return auth.response;
  const current = await prisma.recruitmentCandidateEvidence.findFirst({ where: candidateOwnedRecordWhere(auth.result.candidate.id, id) });
  if (!current) return NextResponse.json({ error: "Evidence item not found." }, { status: 404 });
  await prisma.$transaction([
    prisma.recruitmentActivityEvent.create({
      data: { candidateId: auth.result.candidate.id, eventType: "evidence_removed", taskNumber: current.taskNumber, metadata: { evidenceId: id } },
    }),
    prisma.recruitmentCandidateEvidence.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}
