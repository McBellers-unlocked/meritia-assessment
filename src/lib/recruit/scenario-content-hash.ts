import { createHash } from "node:crypto";

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalise(item)])
    );
  }
  return value instanceof Date ? value.toISOString() : value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}

export function hashScenarioSnapshot(snapshot: unknown): string {
  return createHash("sha256").update(canonicalJson(snapshot), "utf8").digest("hex");
}

export function isValidationRunStale(currentHash: string, validatedHash?: string | null): boolean {
  return !validatedHash || currentHash !== validatedHash;
}

export async function loadScenarioContentSnapshot(scenarioId: string) {
  // Keep the hashing primitives importable in unit tests and worker utilities
  // that do not have a database connection. Only the DB-backed loader needs
  // to initialise Prisma.
  const { prisma } = await import("@/lib/prisma");
  const scenario = await prisma.recruitmentScenario.findUnique({
    where: { id: scenarioId },
    select: {
      id: true,
      slug: true,
      title: true,
      organisation: true,
      positionTitle: true,
      defaultTotalMinutes: true,
      assessmentMode: true,
      modePolicyVersion: true,
      defenceEnabled: true,
      defenceQuestionCount: true,
      defenceMinutes: true,
      criteria: {
        orderBy: { order: "asc" },
        select: {
          id: true, code: true, name: true, description: true,
          sourceRequirement: true, observableBehaviours: true, order: true,
          taskMappings: {
            orderBy: { taskId: "asc" },
            select: { taskId: true, expectedCandidateEvidence: true, rubricElementIds: true, marks: true },
          },
        },
      },
      exhibits: {
        orderBy: { id: "asc" },
        select: { id: true, sourceId: true, title: true, html: true },
      },
      tasks: {
        orderBy: { number: "asc" },
        select: {
          id: true, number: true, kind: true, title: true, briefMarkdown: true,
          totalMarks: true, systemPrompt: true, exhibitId: true,
          deliverableLabel: true, deliverablePlaceholder: true, config: true, rubric: true,
          emails: {
            orderBy: { orderIndex: "asc" },
            select: {
              id: true, orderIndex: true, triggerOffsetSeconds: true, senderName: true,
              senderEmail: true, subject: true, bodyHtml: true, expectedAction: true, markerNotes: true,
            },
          },
          chatScripts: {
            orderBy: { id: "asc" },
            select: {
              id: true, triggerOffsetSeconds: true, personaName: true, personaRole: true,
              openerMessage: true, systemPrompt: true, maxTurns: true, expectedOutcomes: true,
            },
          },
        },
      },
    },
  });
  if (!scenario) return null;
  return scenario;
}

export async function getScenarioContentHash(scenarioId: string): Promise<string | null> {
  const snapshot = await loadScenarioContentSnapshot(scenarioId);
  return snapshot ? hashScenarioSnapshot(snapshot) : null;
}
