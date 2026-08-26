export type ValidationFindingCategory =
  | "criterion_coverage" | "job_relevance" | "answer_leakage" | "ambiguity"
  | "evidence_lineage" | "rubric_quality" | "difficulty" | "time_feasibility"
  | "accessibility" | "language" | "mode_alignment" | "knowledge_system_policy";
export type ValidationFindingSeverity = "blocker" | "warning" | "note";
export type ValidationFindingDisposition = "open" | "resolved" | "accepted_risk" | "dismissed";

export type ValidationFinding = {
  id: string;
  category: ValidationFindingCategory;
  severity: ValidationFindingSeverity;
  title: string;
  explanation: string;
  evidenceReferences: string[];
  recommendation: string;
  disposition: ValidationFindingDisposition;
  reviewerNote?: string;
};

export type DeterministicCheck = {
  id: string;
  passed: boolean;
  severity: ValidationFindingSeverity;
  label: string;
  detail: string;
};

export type BlueprintRow = {
  criterionId: string;
  criterionCode: string;
  criterion: string;
  observableBehaviour: string;
  taskId: string | null;
  taskNumber: number | null;
  taskTitle: string | null;
  candidateEvidence: string | null;
  rubricElementIds: string[];
  marks: number;
  gap: string | null;
};
