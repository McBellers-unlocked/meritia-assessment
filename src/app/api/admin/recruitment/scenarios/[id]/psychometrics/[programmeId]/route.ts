import { NextRequest, NextResponse } from "next/server";
import type {
  RecruitmentPsychometricConclusion,
  RecruitmentPsychometricEvidenceCategory,
  RecruitmentPsychometricEvidenceStatus,
  RecruitmentPsychometricProgrammeStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { loadPsychometricProgrammeDashboard } from "@/lib/recruit/psychometric-programme-service";
import {
  PSYCHOMETRIC_EVIDENCE_CATEGORIES,
  programmeReadiness,
} from "@/lib/recruit/psychometrics";

export const dynamic = "force-dynamic";

const PROGRAMME_STATUSES = [
  "DRAFT", "STUDY_READY", "PILOT_ACTIVE", "ANALYSIS", "EVIDENCE_REVIEW", "ARCHIVED",
] as const;
const EVIDENCE_STATUSES = [
  "NOT_STARTED", "PLANNED", "IN_PROGRESS", "EVIDENCE_AVAILABLE", "INSUFFICIENT", "NOT_APPLICABLE",
] as const;
const CONCLUSIONS = [
  "NOT_EVALUATED", "INSUFFICIENT_EVIDENCE", "SUPPORTS_INTENDED_USE",
  "SUPPORTS_WITH_LIMITATIONS", "DOES_NOT_SUPPORT_INTENDED_USE",
] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; programmeId: string } },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const programme = await prisma.recruitmentPsychometricProgramme.findFirst({
    where: { id: params.programmeId, scenarioId: params.id },
    include: {
      evidenceRecords: true,
      pilotCohorts: true,
      raterAssignments: { select: { raterId: true } },
    },
  });
  if (!programme) return NextResponse.json({ error: "Programme not found" }, { status: 404 });
  if (programme.status === "ARCHIVED") {
    return NextResponse.json({ error: "Archived programmes are read-only." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "");
  try {
    if (action === "update_protocol") {
      await updateProtocol(programme, body);
    } else if (action === "update_evidence") {
      await updateEvidence(programme.id, auth.userId, body);
    } else if (action === "link_cohort") {
      await linkCohort(programme, body);
    } else if (action === "assign_raters") {
      await assignRaters(programme, body);
    } else if (action === "record_review") {
      await recordIndependentReview(programme, body);
    } else {
      return NextResponse.json({ error: "Unknown programme action." }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update programme.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json(await loadPsychometricProgrammeDashboard(params.id));
}

async function updateProtocol(
  programme: {
    id: string;
    intendedUse: string;
    targetPopulation: string;
    constructDefinition: string;
    decisionContext: string;
    pilotCohorts: unknown[];
    raterAssignments: Array<{ raterId: string }>;
  },
  body: Record<string, unknown>,
) {
  const intendedUse = textField(body.intendedUse, 8_000) || programme.intendedUse;
  const targetPopulation = textField(body.targetPopulation, 8_000) || programme.targetPopulation;
  const constructDefinition = textField(body.constructDefinition, 12_000) || programme.constructDefinition;
  const decisionContext = textField(body.decisionContext, 8_000) || programme.decisionContext;
  const status = String(body.status ?? "DRAFT") as RecruitmentPsychometricProgrammeStatus;
  if (!PROGRAMME_STATUSES.includes(status as typeof PROGRAMME_STATUSES[number])) {
    throw new Error("Invalid programme status.");
  }
  if (["STUDY_READY", "PILOT_ACTIVE", "ANALYSIS", "EVIDENCE_REVIEW"].includes(status)) {
    const readiness = programmeReadiness({
      intendedUse,
      targetPopulation,
      constructDefinition,
      decisionContext,
      pilotCohorts: programme.pilotCohorts.length,
      distinctRaters: new Set(programme.raterAssignments.map((item) => item.raterId)).size,
    });
    if (!readiness.ready) throw new Error(readiness.gaps.join(" "));
  }
  await prisma.recruitmentPsychometricProgramme.update({
    where: { id: programme.id },
    data: {
      name: textField(body.name, 240) || undefined,
      intendedUse,
      targetPopulation,
      constructDefinition,
      decisionContext,
      status,
    },
  });
}

async function updateEvidence(programmeId: string, userId: string, body: Record<string, unknown>) {
  const category = String(body.category ?? "") as RecruitmentPsychometricEvidenceCategory;
  const status = String(body.status ?? "") as RecruitmentPsychometricEvidenceStatus;
  if (!PSYCHOMETRIC_EVIDENCE_CATEGORIES.includes(category as typeof PSYCHOMETRIC_EVIDENCE_CATEGORIES[number])) {
    throw new Error("Invalid evidence category.");
  }
  if (!EVIDENCE_STATUSES.includes(status as typeof EVIDENCE_STATUSES[number])) {
    throw new Error("Invalid evidence status.");
  }
  const fields = {
    summary: nullableText(body.summary, 12_000),
    methodology: nullableText(body.methodology, 20_000),
    sampleDescription: nullableText(body.sampleDescription, 12_000),
    findings: nullableText(body.findings, 20_000),
    limitations: nullableText(body.limitations, 12_000),
  };
  if (status === "EVIDENCE_AVAILABLE" && (!fields.methodology || !fields.sampleDescription || !fields.findings || !fields.limitations)) {
    throw new Error("Evidence available requires methodology, sample, findings and limitations.");
  }
  await prisma.recruitmentPsychometricEvidence.update({
    where: { programmeId_category: { programmeId, category } },
    data: { ...fields, status, updatedById: userId },
  });
}

async function linkCohort(
  programme: { id: string; scenarioId: string; assessmentVersionId: string },
  body: Record<string, unknown>,
) {
  const assessmentId = String(body.assessmentId ?? "");
  const assessment = await prisma.recruitmentAssessment.findFirst({
    where: { id: assessmentId, customScenarioId: programme.scenarioId },
    select: {
      id: true,
      assessmentVersionId: true,
      candidates: { select: { status: true } },
    },
  });
  if (!assessment) throw new Error("Cohort does not belong to this scenario.");
  let versionBasis: "CAPTURED_AT_CREATION" | "LINKED_BEFORE_PARTICIPATION" | "RETROSPECTIVE_ATTESTATION";
  let attestation: string | null = null;
  if (assessment.assessmentVersionId === programme.assessmentVersionId) {
    versionBasis = "CAPTURED_AT_CREATION";
  } else if (assessment.assessmentVersionId) {
    throw new Error("Cohort is bound to a different immutable assessment version.");
  } else {
    const participationStarted = assessment.candidates.some((candidate) => candidate.status !== "invited");
    if (!participationStarted) {
      await prisma.recruitmentAssessment.update({
        where: { id: assessment.id },
        data: { assessmentVersionId: programme.assessmentVersionId },
      });
      versionBasis = "LINKED_BEFORE_PARTICIPATION";
    } else {
      attestation = textField(body.retrospectiveAttestation, 8_000);
      if (attestation.length < 40) {
        throw new Error("A detailed retrospective version attestation is required for a cohort already in progress.");
      }
      versionBasis = "RETROSPECTIVE_ATTESTATION";
    }
  }
  await prisma.recruitmentPsychometricPilotCohort.upsert({
    where: { programmeId_assessmentId: { programmeId: programme.id, assessmentId } },
    create: { programmeId: programme.id, assessmentId, versionBasis, retrospectiveAttestation: attestation },
    update: { versionBasis, retrospectiveAttestation: attestation },
  });
}

async function assignRaters(
  programme: { id: string; pilotCohorts: Array<{ assessmentId: string }> },
  body: Record<string, unknown>,
) {
  const assessmentId = String(body.assessmentId ?? "");
  if (!programme.pilotCohorts.some((link) => link.assessmentId === assessmentId)) {
    throw new Error("Link the cohort to this programme before assigning raters.");
  }
  const raterIds = Array.isArray(body.raterIds)
    ? Array.from(new Set(body.raterIds.map(String).filter(Boolean)))
    : [];
  if (raterIds.length < 2) throw new Error("Select at least two independent raters.");
  const validRaters = await prisma.user.findMany({
    where: { id: { in: raterIds }, role: "ADMIN" },
    select: { id: true },
  });
  if (validRaters.length !== raterIds.length) throw new Error("One or more raters are unavailable.");
  const candidates = await prisma.recruitmentCandidate.findMany({
    where: { assessmentId, status: "submitted" },
    select: { id: true },
  });
  if (!candidates.length) throw new Error("The pilot cohort has no submitted candidates.");
  const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("Invalid rater due date.");
  await prisma.recruitmentPsychometricRaterAssignment.createMany({
    data: candidates.flatMap((candidate) => raterIds.map((raterId, index) => ({
      programmeId: programme.id,
      candidateId: candidate.id,
      raterId,
      sequence: index + 1,
      dueAt,
    }))),
    skipDuplicates: true,
  });
}

async function recordIndependentReview(
  programme: {
    id: string;
    intendedUse: string;
    targetPopulation: string;
    constructDefinition: string;
    decisionContext: string;
    evidenceRecords: Array<{ status: RecruitmentPsychometricEvidenceStatus }>;
    pilotCohorts: unknown[];
    raterAssignments: Array<{ raterId: string }>;
  },
  body: Record<string, unknown>,
) {
  const conclusion = String(body.conclusion ?? "") as RecruitmentPsychometricConclusion;
  if (!CONCLUSIONS.includes(conclusion as typeof CONCLUSIONS[number])) throw new Error("Invalid review conclusion.");
  const reviewerName = textField(body.independentReviewerName, 240);
  const credentials = textField(body.independentReviewerCredentials, 4_000);
  const limitations = textField(body.limitations, 12_000);
  if (!reviewerName || !credentials || !limitations) {
    throw new Error("Independent reviewer name, credentials and limitations are required.");
  }
  if (["SUPPORTS_INTENDED_USE", "SUPPORTS_WITH_LIMITATIONS"].includes(conclusion)) {
    if (programme.evidenceRecords.some((record) => record.status !== "EVIDENCE_AVAILABLE")) {
      throw new Error("A supportive conclusion requires evidence available in all six evidence domains.");
    }
    const readiness = programmeReadiness({
      intendedUse: programme.intendedUse,
      targetPopulation: programme.targetPopulation,
      constructDefinition: programme.constructDefinition,
      decisionContext: programme.decisionContext,
      pilotCohorts: programme.pilotCohorts.length,
      distinctRaters: new Set(programme.raterAssignments.map((item) => item.raterId)).size,
    });
    if (!readiness.ready) throw new Error(readiness.gaps.join(" "));
  }
  await prisma.recruitmentPsychometricProgramme.update({
    where: { id: programme.id },
    data: {
      conclusion,
      limitations,
      independentReviewerName: reviewerName,
      independentReviewerCredentials: credentials,
      reviewedAt: new Date(),
      status: conclusion === "NOT_EVALUATED" ? undefined : "EVIDENCE_REVIEW",
    },
  });
}

function textField(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableText(value: unknown, max: number): string | null {
  const text = textField(value, max);
  return text || null;
}
