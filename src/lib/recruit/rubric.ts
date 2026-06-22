/**
 * Load the per-scenario marking rubric from infra/recruit/<scenarioId>/.
 * Used by the marker UI to display task limits and IPSAS issue lists.
 *
 * Two sources, unified by loadRubricForAssessment():
 *   - Legacy code scenarios (fam-p4-2026 / aplo-p2-2026): a static JSON
 *     file with hardcoded task1/task2 (loadRubric below).
 *   - DB scenarios (AI-generated from a JD): the rubric is authored per
 *     task by the task-generator Lambda and stored on
 *     RecruitmentScenarioTask.rubric. These can have 1–5 tasks.
 *
 * NOTE: server-only (uses node:fs + prisma). Client components must
 * import the *types* with `import type`, never the functions.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@/lib/prisma";

export interface RubricIssue {
  id: string;
  title: string;
  max_marks?: number;
  description?: string;
}
export interface RubricTaskCategory {
  max: number;
  description?: string;
  embedded_issues?: RubricIssue[];
  indicators?: string[];
  rubric?: Record<string, string>;
  descriptors?: Record<string, string>;
}
export interface RubricTask {
  title: string;
  max_marks: number;
  categories: Record<string, RubricTaskCategory>;
}
export interface ScenarioRubric {
  scenario_id: string;
  position?: string;
  organisation?: string;
  total_marks: number;
  task1: RubricTask;
  task2: RubricTask;
}

const SCENARIO_DIR_MAP: Record<string, string> = {
  "fam-p4-2026": "idsc-fam-p4-2026",
  "aplo-p2-2026": "idsc-aplo-p2-2026",
  "cso-p3-2026": "idsc-cso-p3-2026",
  "ipac-d1-2026": "ipac-d1-2026",
};

export function loadRubric(scenarioId: string): ScenarioRubric | null {
  const dirName = SCENARIO_DIR_MAP[scenarioId];
  if (!dirName) return null;
  try {
    const path = join(process.cwd(), "infra", "recruit", dirName, "marking_rubric.json");
    return JSON.parse(readFileSync(path, "utf-8")) as ScenarioRubric;
  } catch (e) {
    console.warn(`[rubric] failed to load for ${scenarioId}:`, (e as Error).message);
    return null;
  }
}

/** Flatten all embedded issues across both tasks. */
export function allIssues(rubric: ScenarioRubric): RubricIssue[] {
  const out: RubricIssue[] = [];
  for (const task of [rubric.task1, rubric.task2]) {
    for (const cat of Object.values(task.categories)) {
      if (cat.embedded_issues) out.push(...cat.embedded_issues);
    }
  }
  return out;
}

/**
 * N-task rubric shape used by the marking screens. Unlike ScenarioRubric
 * (fixed task1/task2), tasks is keyed by task number so it carries 1–5
 * tasks uniformly for both legacy and DB scenarios.
 */
export interface NormalizedRubric {
  total_marks: number;
  tasks: Record<number, RubricTask>;
}

/**
 * Resolve an assessment to its marking rubric, normalised to N tasks.
 *
 * - DB scenario (customScenarioId set): read the per-task rubric authored
 *   by the Lambda. IMPORTANT: even when a task's rubric is null (the
 *   rubric call failed soft), we still return a real `max_marks` (the
 *   task's totalMarks) and a real `total_marks`, so the marking screen's
 *   score denominators stay correct — only the category panel is empty.
 * - Legacy scenario: map the static JSON's task1/task2 into the same
 *   shape, preserving every nested field so the two hand-authored
 *   scenarios render byte-identically.
 *
 * Returns null only when there is genuinely no rubric source (a legacy
 * scenarioId with no JSON file, and no customScenarioId).
 */
export async function loadRubricForAssessment(a: {
  scenarioId: string;
  customScenarioId: string | null;
}): Promise<NormalizedRubric | null> {
  if (a.customScenarioId) {
    const taskRows = await prisma.recruitmentScenarioTask.findMany({
      where: { scenarioId: a.customScenarioId },
      orderBy: { number: "asc" },
      select: { number: true, title: true, totalMarks: true, rubric: true },
    });
    const tasks: Record<number, RubricTask> = {};
    let total = 0;
    for (const t of taskRows) {
      tasks[t.number] = {
        title: t.title,
        max_marks: t.totalMarks,
        categories:
          (t.rubric as Record<string, RubricTaskCategory> | null) ?? {},
      };
      total += t.totalMarks;
    }
    return { total_marks: total, tasks };
  }

  const legacy = loadRubric(a.scenarioId);
  if (!legacy) return null;
  return {
    total_marks: legacy.total_marks,
    tasks: { 1: legacy.task1, 2: legacy.task2 },
  };
}

/** Flatten all embedded issues across every task of a normalised rubric. */
export function allIssuesNormalized(r: NormalizedRubric): RubricIssue[] {
  const out: RubricIssue[] = [];
  for (const task of Object.values(r.tasks)) {
    for (const cat of Object.values(task.categories)) {
      if (cat.embedded_issues) out.push(...cat.embedded_issues);
    }
  }
  return out;
}
