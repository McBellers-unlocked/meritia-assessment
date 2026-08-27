import { Prisma, type RecruitmentAssessmentVersion } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  hashScenarioSnapshot,
  loadScenarioContentSnapshot,
} from "./scenario-content-hash";
import type {
  NormalizedRubric,
  RubricTask,
  RubricTaskCategory,
} from "./rubric";

export type AssessmentVersionSnapshot = NonNullable<
  Awaited<ReturnType<typeof loadScenarioContentSnapshot>>
>;

export interface FrozenCriterionMapping {
  id: string;
  code: string;
  name: string;
  description: string;
  sourceRequirement: string | null;
  observableBehaviours: unknown;
  roleEvidence: unknown;
  order: number;
  taskMappings: Array<{
    taskId: string;
    taskNumber: number;
    expectedCandidateEvidence: string;
    rubricElementIds: string[];
    marks: number;
  }>;
}

/**
 * Capture or reuse the content-addressed version for the scenario as it exists
 * now. This is deliberately separate from a psychometric programme: every new
 * DB-backed cohort benefits from immutable delivery even when no study exists.
 */
export async function getOrCreateAssessmentVersion(
  scenarioId: string,
  createdById: string,
): Promise<RecruitmentAssessmentVersion> {
  const snapshot = await loadScenarioContentSnapshot(scenarioId);
  if (!snapshot) throw new Error("Scenario not found.");
  const scenarioHash = hashScenarioSnapshot(snapshot);
  const key = { scenarioId_scenarioHash: { scenarioId, scenarioHash } };
  const existing = await prisma.recruitmentAssessmentVersion.findUnique({ where: key });
  if (existing) return existing;

  try {
    return await prisma.recruitmentAssessmentVersion.create({
      data: {
        scenarioId,
        scenarioHash,
        label: `${snapshot.title} · ${scenarioHash.slice(0, 8)}`,
        scenarioSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        assessmentMode: snapshot.assessmentMode,
        modePolicyVersion: snapshot.modePolicyVersion,
        createdById,
      },
    });
  } catch (error) {
    // Two simultaneous cohort/programme creations may race on the content hash.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.recruitmentAssessmentVersion.findUnique({ where: key });
      if (raced) return raced;
    }
    throw error;
  }
}

export async function loadAssessmentVersionSnapshot(
  assessmentVersionId: string,
): Promise<AssessmentVersionSnapshot | null> {
  const row = await prisma.recruitmentAssessmentVersion.findUnique({
    where: { id: assessmentVersionId },
    select: { scenarioSnapshot: true },
  });
  return row?.scenarioSnapshot
    ? (row.scenarioSnapshot as unknown as AssessmentVersionSnapshot)
    : null;
}

export function rubricFromAssessmentSnapshot(
  snapshot: AssessmentVersionSnapshot,
): NormalizedRubric {
  const tasks: Record<number, RubricTask> = {};
  let total = 0;
  for (const task of snapshot.tasks) {
    tasks[task.number] = {
      title: task.title,
      max_marks: task.totalMarks,
      categories:
        (task.rubric as Record<string, RubricTaskCategory> | null) ?? {},
    };
    total += task.totalMarks;
  }
  return { total_marks: total, tasks };
}

export function criteriaFromAssessmentSnapshot(
  snapshot: AssessmentVersionSnapshot,
): FrozenCriterionMapping[] {
  const taskNumbers = new Map(snapshot.tasks.map((task) => [task.id, task.number]));
  return snapshot.criteria.map((criterion) => ({
    id: criterion.id,
    code: criterion.code,
    name: criterion.name,
    description: criterion.description,
    sourceRequirement: criterion.sourceRequirement,
    observableBehaviours: criterion.observableBehaviours,
    roleEvidence: criterion.roleEvidence,
    order: criterion.order,
    taskMappings: criterion.taskMappings.map((mapping) => ({
      taskId: mapping.taskId,
      taskNumber: taskNumbers.get(mapping.taskId) ?? 0,
      expectedCandidateEvidence: mapping.expectedCandidateEvidence,
      rubricElementIds: Array.isArray(mapping.rubricElementIds)
        ? mapping.rubricElementIds.map(String)
        : [],
      marks: mapping.marks,
    })),
  }));
}

export async function criteriaForAssessment(assessment: {
  customScenarioId: string | null;
  assessmentVersionId?: string | null;
}): Promise<FrozenCriterionMapping[]> {
  if (assessment.assessmentVersionId) {
    const snapshot = await loadAssessmentVersionSnapshot(assessment.assessmentVersionId);
    if (snapshot) return criteriaFromAssessmentSnapshot(snapshot);
  }
  if (!assessment.customScenarioId) return [];
  const criteria = await prisma.recruitmentScenarioCriterion.findMany({
    where: { scenarioId: assessment.customScenarioId },
    orderBy: { order: "asc" },
    include: {
      taskMappings: {
        include: { task: { select: { number: true } } },
      },
    },
  });
  return criteria.map((criterion) => ({
    id: criterion.id,
    code: criterion.code,
    name: criterion.name,
    description: criterion.description,
    sourceRequirement: criterion.sourceRequirement,
    observableBehaviours: criterion.observableBehaviours,
    roleEvidence: criterion.roleEvidence,
    order: criterion.order,
    taskMappings: criterion.taskMappings.map((mapping) => ({
      taskId: mapping.taskId,
      taskNumber: mapping.task.number,
      expectedCandidateEvidence: mapping.expectedCandidateEvidence,
      rubricElementIds: Array.isArray(mapping.rubricElementIds)
        ? mapping.rubricElementIds.map(String)
        : [],
      marks: mapping.marks,
    })),
  }));
}
