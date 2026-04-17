/**
 * Central scenario loader — resolves a RecruitmentAssessment to a
 * RecruitScenarioConfig regardless of whether the scenario lives in code
 * (src/lib/recruit/fam-p4-2026.ts) or in the database (RecruitmentScenario +
 * children). The candidate UI and APIs call getScenarioForAssessment() and
 * don't need to care about the source.
 *
 * Resolution order:
 *   1. If assessment.customScenarioId is set, load the DB scenario.
 *   2. Otherwise, fall back to the code-based registry (getRecruitScenarioById).
 *
 * This keeps the legacy FAM scenario working unchanged during the rollout.
 */

import { prisma } from "@/lib/prisma";
import { getRecruitScenarioById } from "./fam-p4-2026";
import type {
  RecruitScenarioConfig,
  RecruitTaskConfig,
  TaskKind,
} from "./types";
import type { RecruitmentAssessment } from "@prisma/client";

export async function getScenarioForAssessment(
  assessment: Pick<RecruitmentAssessment, "scenarioId" | "customScenarioId">
): Promise<RecruitScenarioConfig | null> {
  if (assessment.customScenarioId) {
    return getDbScenarioById(assessment.customScenarioId);
  }
  return getRecruitScenarioById(assessment.scenarioId);
}

/**
 * Load a single DB-backed scenario by its id, materialising all task types
 * into the normalised RecruitScenarioConfig shape.
 */
export async function getDbScenarioById(
  id: string
): Promise<RecruitScenarioConfig | null> {
  const row = await prisma.recruitmentScenario.findUnique({
    where: { id },
    include: {
      tasks: {
        include: {
          exhibit: true,
          emails: { orderBy: { orderIndex: "asc" } },
          chatScripts: true,
        },
        orderBy: { number: "asc" },
      },
    },
  });
  if (!row) return null;
  return materialiseScenario(row);
}

/** Load by slug — used by the candidate-facing /assess/[slug] route. */
export async function getDbScenarioBySlug(
  slug: string
): Promise<RecruitScenarioConfig | null> {
  const row = await prisma.recruitmentScenario.findUnique({
    where: { slug },
    include: {
      tasks: {
        include: {
          exhibit: true,
          emails: { orderBy: { orderIndex: "asc" } },
          chatScripts: true,
        },
        orderBy: { number: "asc" },
      },
    },
  });
  if (!row) return null;
  return materialiseScenario(row);
}

// Shape of the scenario+tasks+nested children rows we load. Inlining the
// Prisma query return type gives materialiseScenario exact field knowledge
// without having to maintain a separate hand-rolled type.
type DbScenarioRow = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.recruitmentScenario.findUnique<{
        where: { id: string };
        include: {
          tasks: { include: { exhibit: true; emails: true; chatScripts: true } };
        };
      }>
    >
  >
>;

function materialiseScenario(row: DbScenarioRow): RecruitScenarioConfig {
  return {
    scenarioId: row.id,
    slug: row.slug,
    title: row.title,
    organisation: row.organisation,
    positionTitle: row.positionTitle,
    defaultTotalMinutes: row.defaultTotalMinutes,
    source: "db",
    tasks: row.tasks.map(materialiseTask),
  };
}

function materialiseTask(task: DbScenarioRow["tasks"][number]): RecruitTaskConfig {
  const kind = task.kind as TaskKind;
  switch (kind) {
    case "memo_ai":
      return {
        number: task.number,
        kind: "memo_ai",
        title: task.title,
        briefMarkdown: task.briefMarkdown,
        totalMarks: task.totalMarks,
        systemPrompt: task.systemPrompt ?? "",
        exhibitHtml: task.exhibit?.html ?? "",
        exhibitTitle: task.exhibit?.title ?? "",
        deliverableLabel: task.deliverableLabel ?? "Deliverable",
        deliverablePlaceholder: task.deliverablePlaceholder ?? "",
      };
    case "email_inbox":
      return {
        number: task.number,
        kind: "email_inbox",
        title: task.title,
        briefMarkdown: task.briefMarkdown,
        totalMarks: task.totalMarks,
        emails: task.emails.map((e) => ({
          id: e.id,
          orderIndex: e.orderIndex,
          triggerOffsetSeconds: e.triggerOffsetSeconds,
          senderName: e.senderName,
          senderEmail: e.senderEmail,
          subject: e.subject,
          bodyHtml: e.bodyHtml,
          expectedAction: e.expectedAction as "reply" | "ignore" | "flag" | "forward",
          markerNotes: e.markerNotes,
        })),
      };
    case "chat": {
      // A chat task always has exactly one script (enforced on publish).
      // If the admin hasn't authored one yet we return a placeholder so the
      // builder UI can still render partial state.
      const s = task.chatScripts[0];
      return {
        number: task.number,
        kind: "chat",
        title: task.title,
        briefMarkdown: task.briefMarkdown,
        totalMarks: task.totalMarks,
        script: s
          ? {
              id: s.id,
              triggerOffsetSeconds: s.triggerOffsetSeconds,
              personaName: s.personaName,
              personaRole: s.personaRole,
              openerMessage: s.openerMessage,
              systemPrompt: s.systemPrompt,
              maxTurns: s.maxTurns,
              expectedOutcomes: s.expectedOutcomes,
            }
          : {
              id: "",
              triggerOffsetSeconds: 0,
              personaName: "",
              personaRole: "",
              openerMessage: "",
              systemPrompt: "",
              maxTurns: 8,
              expectedOutcomes: null,
            },
      };
    }
    default: {
      // Unknown kind — treat as memo_ai skeleton so the candidate UI doesn't
      // crash. Admin UI will surface this as a validation error on publish.
      return {
        number: task.number,
        kind: "memo_ai",
        title: task.title,
        briefMarkdown: task.briefMarkdown,
        totalMarks: task.totalMarks,
        systemPrompt: task.systemPrompt ?? "",
        exhibitHtml: task.exhibit?.html ?? "",
        exhibitTitle: task.exhibit?.title ?? "",
        deliverableLabel: task.deliverableLabel ?? "Deliverable",
        deliverablePlaceholder: task.deliverablePlaceholder ?? "",
      };
    }
  }
}

/**
 * Convenience: look up a scenario by either code id (legacy) or slug. Used
 * by the candidate-facing /assess/[slug] resolution where the URL segment
 * is a slug but legacy deep-links may pass a scenarioId.
 */
export async function getScenarioBySlugOrId(
  slugOrId: string
): Promise<RecruitScenarioConfig | null> {
  const db = await getDbScenarioBySlug(slugOrId);
  if (db) return db;
  const code = getRecruitScenarioById(slugOrId);
  if (code) return code;
  return null;
}
