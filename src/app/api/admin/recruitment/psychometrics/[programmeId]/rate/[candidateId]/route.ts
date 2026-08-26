import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import {
  criteriaFromAssessmentSnapshot,
  loadAssessmentVersionSnapshot,
  rubricFromAssessmentSnapshot,
} from "@/lib/recruit/assessment-versions";

export const dynamic = "force-dynamic";

async function loadAssignment(programmeId: string, candidateId: string, raterId: string) {
  return prisma.recruitmentPsychometricRaterAssignment.findFirst({
    where: { programmeId, candidateId, raterId },
    include: {
      programme: {
        select: {
          id: true,
          name: true,
          scenarioId: true,
          status: true,
          assessmentVersionId: true,
          assessmentVersion: { select: { label: true, scenarioHash: true } },
        },
      },
      candidate: {
        select: {
          id: true,
          anonymousId: true,
          status: true,
          responses: {
            orderBy: { taskNumber: "asc" },
            select: { id: true, taskNumber: true, content: true, wordCount: true },
          },
        },
      },
      ratings: { orderBy: { taskNumber: "asc" } },
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { programmeId: string; candidateId: string } },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const assignment = await loadAssignment(params.programmeId, params.candidateId, auth.userId);
  if (!assignment) return NextResponse.json({ error: "Rater assignment not found." }, { status: 404 });
  const snapshot = await loadAssessmentVersionSnapshot(assignment.programme.assessmentVersionId);
  if (!snapshot) return NextResponse.json({ error: "Frozen assessment version is unavailable." }, { status: 500 });
  const rubric = rubricFromAssessmentSnapshot(snapshot);
  const criteria = criteriaFromAssessmentSnapshot(snapshot);
  return NextResponse.json({
    assignment: {
      id: assignment.id,
      status: assignment.status,
      dueAt: assignment.dueAt,
      submittedAt: assignment.submittedAt,
      programme: assignment.programme,
    },
    candidate: assignment.candidate,
    scenario: {
      title: snapshot.title,
      positionTitle: snapshot.positionTitle,
      assessmentMode: snapshot.assessmentMode,
    },
    rubric,
    criteria,
    ratings: assignment.ratings,
    disclosure: "Independent study rating. Candidate identity, operational marks, other raters, dialogue and work-provenance signals are withheld.",
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { programmeId: string; candidateId: string } },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const assignment = await loadAssignment(params.programmeId, params.candidateId, auth.userId);
  if (!assignment) return NextResponse.json({ error: "Rater assignment not found." }, { status: 404 });
  if (assignment.status === "SUBMITTED") {
    return NextResponse.json({ error: "Submitted independent ratings are immutable." }, { status: 409 });
  }
  const snapshot = await loadAssessmentVersionSnapshot(assignment.programme.assessmentVersionId);
  if (!snapshot) return NextResponse.json({ error: "Frozen assessment version is unavailable." }, { status: 500 });
  const rubric = rubricFromAssessmentSnapshot(snapshot);
  const criteria = criteriaFromAssessmentSnapshot(snapshot);
  const body = await request.json().catch(() => ({}));
  const incoming = Array.isArray(body.ratings) ? body.ratings : [];
  if (!incoming.length) return NextResponse.json({ error: "At least one task rating is required." }, { status: 400 });

  const responses = new Map(assignment.candidate.responses.map((response) => [response.id, response]));
  const normalised: Array<{
    responseId: string;
    taskNumber: number;
    score: number;
    criterionScores: Record<string, number>;
    comments: string | null;
  }> = [];
  try {
    for (const raw of incoming) {
      const responseId = String(raw?.responseId ?? "");
      const response = responses.get(responseId);
      if (!response) throw new Error("A rating does not belong to this anonymous submission.");
      const taskRubric = rubric.tasks[response.taskNumber];
      if (!taskRubric) throw new Error(`Task ${response.taskNumber} is not part of the frozen rubric.`);
      const score = Number(raw?.score);
      if (!Number.isFinite(score) || score < 0 || score > taskRubric.max_marks) {
        throw new Error(`Task ${response.taskNumber} score must be between 0 and ${taskRubric.max_marks}.`);
      }
      const criterionScores: Record<string, number> = {};
      const allowedCriteria = new Map(
        criteria.flatMap((criterion) => criterion.taskMappings
          .filter((mapping) => mapping.taskNumber === response.taskNumber && mapping.marks > 0)
          .map((mapping) => [criterion.id, mapping.marks] as const)),
      );
      if (raw?.criterionScores && typeof raw.criterionScores === "object" && !Array.isArray(raw.criterionScores)) {
        for (const [criterionId, rawScore] of Object.entries(raw.criterionScores)) {
          if (rawScore == null || rawScore === "") continue;
          const maximum = allowedCriteria.get(criterionId);
          const criterionScore = Number(rawScore);
          if (maximum == null || !Number.isFinite(criterionScore) || criterionScore < 0 || criterionScore > maximum) {
            throw new Error(`Invalid criterion score for task ${response.taskNumber}.`);
          }
          criterionScores[criterionId] = criterionScore;
        }
      }
      normalised.push({
        responseId,
        taskNumber: response.taskNumber,
        score,
        criterionScores,
        comments: typeof raw?.comments === "string" ? raw.comments.trim().slice(0, 12_000) || null : null,
      });
    }
    if (body.submit === true) {
      const scoredResponseIds = new Set(normalised.map((rating) => rating.responseId));
      const required = assignment.candidate.responses.filter((response) => (rubric.tasks[response.taskNumber]?.max_marks ?? 0) > 0);
      if (required.some((response) => !scoredResponseIds.has(response.id))) {
        throw new Error("Complete every scored written response before submitting the independent rating.");
      }
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const rating of normalised) {
      await tx.recruitmentPsychometricRating.upsert({
        where: { assignmentId_responseId: { assignmentId: assignment.id, responseId: rating.responseId } },
        create: {
          assignmentId: assignment.id,
          responseId: rating.responseId,
          taskNumber: rating.taskNumber,
          score: rating.score,
          criterionScores: rating.criterionScores as Prisma.InputJsonValue,
          comments: rating.comments,
          submittedAt: body.submit === true ? now : null,
        },
        update: {
          score: rating.score,
          criterionScores: rating.criterionScores as Prisma.InputJsonValue,
          comments: rating.comments,
          submittedAt: body.submit === true ? now : null,
        },
      });
    }
    await tx.recruitmentPsychometricRaterAssignment.update({
      where: { id: assignment.id },
      data: {
        status: body.submit === true ? "SUBMITTED" : "IN_PROGRESS",
        submittedAt: body.submit === true ? now : null,
      },
    });
  });
  return NextResponse.json({ ok: true, submitted: body.submit === true });
}
