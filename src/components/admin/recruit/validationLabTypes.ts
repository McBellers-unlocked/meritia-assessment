import type { EditorScenario } from "./scenarioEditorTypes";

export type ValidationFinding = {
  id: string; category: string; severity: "blocker" | "warning" | "note";
  title: string; explanation: string; evidenceReferences: string[]; recommendation: string;
  disposition: "open" | "resolved" | "accepted_risk" | "dismissed"; reviewerNote?: string;
};
export type ValidationRun = {
  id: string; scenarioHash: string; assessmentMode: string; status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  progressStage: string; overallReadiness: string | null; promptVersion: string; model: string;
  deterministicChecks: Array<{ id: string; passed: boolean; severity: string; label: string; detail: string }> | null;
  findings: ValidationFinding[] | null;
  criterionCoverage: Array<Record<string, unknown>> | null;
  syntheticProfiles: Array<{ level: string; response: string; designObservations: string[] }> | null;
  policyTests: Array<{ request: string; response: string; boundaryHeld: boolean; observations: string }> | null;
  summary: string | null; error: string | null; createdAt: string; completedAt: string | null;
};
export type ScenarioReview = { id: string; validationRunId: string | null; reviewType: string; decision: string; notes: string; reviewerId: string; createdAt: string };
export type ValidationLabData = {
  source: "db";
  currentHash: string;
  latestRunStale: boolean;
  readiness: { ready: boolean; currentHash: string; latestRunId: string | null; stale: boolean; blockers: string[] };
  criteria: NonNullable<EditorScenario["criteria"]>;
  runs: ValidationRun[];
  reviews: ScenarioReview[];
};
