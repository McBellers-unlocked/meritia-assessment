/**
 * Load the per-scenario marking rubric from infra/recruit/<scenarioId>/.
 * Used by the marker UI to display task limits and IPSAS issue lists.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
