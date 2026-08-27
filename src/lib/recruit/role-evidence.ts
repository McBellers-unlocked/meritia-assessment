import type { AssessmentMode } from "./assessment-modes";

export const ROLE_EVIDENCE_REVIEW_VERSION = "role-evidence-v1" as const;

export const ROLE_EVIDENCE_SOURCE_KINDS = ["UPLOADED_JD", "WIPO", "ITU"] as const;
export const ROLE_EVIDENCE_ORIGINS = ["ESSENTIAL", "DESIRABLE", "MANUAL"] as const;
export const ROLE_EVIDENCE_ENTRY_REQUIREMENTS = [
  "REQUIRED_AT_ENTRY",
  "PARTLY_REQUIRED",
  "LEARNABLE_AFTER_APPOINTMENT",
] as const;
export const ROLE_EVIDENCE_IMPORTANCE = ["CORE", "SUPPORTING", "PERIPHERAL"] as const;
export const ROLE_EVIDENCE_CONSEQUENCES = ["HIGH", "MEDIUM", "LOW"] as const;
export const ROLE_EVIDENCE_OBSERVABILITY = ["CLEARLY", "PARTLY", "NOT_OBSERVABLE"] as const;
export const ROLE_EVIDENCE_AI_CONDITIONS = ["INDEPENDENT", "EVIDENCE", "COPILOT", "OPEN_AGENT"] as const;
export const ROLE_EVIDENCE_DECISIONS = ["KEEP", "EXCLUDE"] as const;

export type RoleEvidenceSourceKind = (typeof ROLE_EVIDENCE_SOURCE_KINDS)[number];
export type RoleEvidenceOrigin = (typeof ROLE_EVIDENCE_ORIGINS)[number];
export type RoleEvidenceEntryRequirement = (typeof ROLE_EVIDENCE_ENTRY_REQUIREMENTS)[number];
export type RoleEvidenceImportance = (typeof ROLE_EVIDENCE_IMPORTANCE)[number];
export type RoleEvidenceConsequence = (typeof ROLE_EVIDENCE_CONSEQUENCES)[number];
export type RoleEvidenceObservability = (typeof ROLE_EVIDENCE_OBSERVABILITY)[number];
export type RoleEvidenceAiCondition = (typeof ROLE_EVIDENCE_AI_CONDITIONS)[number];
export type RoleEvidenceDecision = (typeof ROLE_EVIDENCE_DECISIONS)[number];

export interface RoleEvidenceReview {
  reviewId: string;
  sourceRequirement: string;
  criterion: string;
  origin: RoleEvidenceOrigin;
  entryRequirement: RoleEvidenceEntryRequirement;
  importance: RoleEvidenceImportance;
  consequence: RoleEvidenceConsequence;
  observability: RoleEvidenceObservability;
  aiCondition: RoleEvidenceAiCondition;
  observableBehaviours: string[];
  expectedCandidateEvidence: string;
  reviewerRationale: string;
  decision: RoleEvidenceDecision;
  confirmed: boolean;
}

export interface RoleEvidenceRecord {
  version: typeof ROLE_EVIDENCE_REVIEW_VERSION;
  sourceKind: RoleEvidenceSourceKind;
  sourceLabel: string;
  sourceLink: string | null;
  assessmentMode: AssessmentMode;
  disclaimer: string;
  criteria: RoleEvidenceReview[];
}

export interface RoleEvidenceWarning {
  severity: "warning" | "note";
  message: string;
}

export const ROLE_EVIDENCE_DISCLAIMER =
  "Initial assessment-design evidence based on role documentation and accountable human review. It is not a completed job analysis or psychometric validation study.";

export const ROLE_EVIDENCE_LABELS = {
  entryRequirement: {
    REQUIRED_AT_ENTRY: "Required at entry",
    PARTLY_REQUIRED: "Partly required",
    LEARNABLE_AFTER_APPOINTMENT: "Learnable after appointment",
  },
  importance: { CORE: "Core", SUPPORTING: "Supporting", PERIPHERAL: "Peripheral" },
  consequence: { HIGH: "High", MEDIUM: "Medium", LOW: "Low" },
  observability: { CLEARLY: "Clearly", PARTLY: "Partly", NOT_OBSERVABLE: "Not observable" },
  aiCondition: {
    INDEPENDENT: "Independent",
    EVIDENCE: "Evidence",
    COPILOT: "Copilot",
    OPEN_AGENT: "Open Agent",
  },
  decision: { KEEP: "Keep", EXCLUDE: "Exclude" },
} as const;

function proposedBehaviours(criterion: string): string[] {
  return [
    `Applies ${criterion} to a realistic work problem and reaches a defensible conclusion.`,
    `Uses relevant evidence and explains the reasoning behind decisions involving ${criterion}.`,
  ];
}

export function createRoleEvidenceReview(input: {
  criterion: string;
  origin: RoleEvidenceOrigin;
  index: number;
  assessmentMode: AssessmentMode;
}): RoleEvidenceReview {
  const criterion = input.criterion.trim();
  const essential = input.origin === "ESSENTIAL";
  const desirable = input.origin === "DESIRABLE";
  return {
    reviewId: `role-evidence-${input.index + 1}`,
    sourceRequirement: criterion,
    criterion,
    origin: input.origin,
    entryRequirement: essential ? "REQUIRED_AT_ENTRY" : "PARTLY_REQUIRED",
    importance: essential ? "CORE" : desirable ? "SUPPORTING" : "CORE",
    consequence: "MEDIUM",
    observability: "PARTLY",
    aiCondition: input.assessmentMode,
    observableBehaviours: proposedBehaviours(criterion),
    expectedCandidateEvidence: `A job-relevant work product and reasoning trail showing how the candidate applied ${criterion}, checked the available evidence and justified the resulting decision.`,
    reviewerRationale: essential
      ? "The source identifies this as essential. Retain it provisionally, subject to confirmation that it is genuinely required at entry and material to effective performance."
      : desirable
        ? "The source identifies this as desirable. Retain it provisionally only if assessing it is proportionate and adds useful evidence beyond the essential criteria."
        : "This criterion was added by the reviewer. Retain it provisionally, subject to confirming role relevance and evidence beyond the assessment designer's judgement.",
    decision: "KEEP",
    confirmed: false,
  };
}

export function roleEvidenceWarnings(
  review: RoleEvidenceReview,
  assessmentMode: AssessmentMode,
): RoleEvidenceWarning[] {
  const warnings: RoleEvidenceWarning[] = [];
  if (review.decision === "EXCLUDE" && review.importance === "CORE") {
    warnings.push({ severity: "warning", message: "A core requirement is excluded. Record how it will be assessed elsewhere." });
  }
  if (review.decision === "KEEP" && review.entryRequirement === "LEARNABLE_AFTER_APPOINTMENT") {
    warnings.push({ severity: "warning", message: "This may be learnable after appointment; confirm that pre-hire testing is proportionate." });
  }
  if (review.decision === "KEEP" && review.observability === "NOT_OBSERVABLE") {
    warnings.push({ severity: "warning", message: "The requirement is not observable in this assessment. Exclude it or use a different method." });
  } else if (review.decision === "KEEP" && review.observability === "PARTLY") {
    warnings.push({ severity: "note", message: "Only part of the requirement is observable; keep the scoring claim narrow." });
  }
  if (review.decision === "KEEP" && review.importance === "PERIPHERAL") {
    warnings.push({ severity: "note", message: "A peripheral requirement is consuming assessment time; confirm the trade-off." });
  }
  if (
    review.decision === "KEEP" &&
    review.aiCondition !== "INDEPENDENT" &&
    review.aiCondition !== assessmentMode
  ) {
    warnings.push({ severity: "warning", message: `The proposed ${ROLE_EVIDENCE_LABELS.aiCondition[review.aiCondition]} condition does not match the scenario's ${ROLE_EVIDENCE_LABELS.aiCondition[assessmentMode]} mode.` });
  }
  return warnings;
}

export function roleEvidenceReadiness(reviews: RoleEvidenceReview[]): {
  ready: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  if (!reviews.some((review) => review.decision === "KEEP")) {
    blockers.push("Keep at least one criterion.");
  }
  reviews.forEach((review, index) => {
    const label = review.criterion.trim() || `Criterion ${index + 1}`;
    if (!review.confirmed) blockers.push(`${label}: confirm the review.`);
    if (review.reviewerRationale.trim().length < 10) blockers.push(`${label}: add a reviewer rationale.`);
    if (review.decision === "KEEP" && review.criterion.trim().length < 3) blockers.push(`Criterion ${index + 1}: add a clear criterion.`);
    if (review.decision === "KEEP" && review.observableBehaviours.filter((item: string) => item.trim()).length === 0) blockers.push(`${label}: add at least one observable behaviour.`);
    if (review.decision === "KEEP" && review.expectedCandidateEvidence.trim().length < 10) blockers.push(`${label}: describe the expected candidate evidence.`);
  });
  return { ready: blockers.length === 0, blockers };
}

function isOneOf<const T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === "string" && options.includes(value as T[number]);
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

export function normaliseRoleEvidenceReview(value: unknown): RoleEvidenceReview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    !isOneOf(input.origin, ROLE_EVIDENCE_ORIGINS) ||
    !isOneOf(input.entryRequirement, ROLE_EVIDENCE_ENTRY_REQUIREMENTS) ||
    !isOneOf(input.importance, ROLE_EVIDENCE_IMPORTANCE) ||
    !isOneOf(input.consequence, ROLE_EVIDENCE_CONSEQUENCES) ||
    !isOneOf(input.observability, ROLE_EVIDENCE_OBSERVABILITY) ||
    !isOneOf(input.aiCondition, ROLE_EVIDENCE_AI_CONDITIONS) ||
    !isOneOf(input.decision, ROLE_EVIDENCE_DECISIONS)
  ) return null;
  const sourceRequirement = cleanText(input.sourceRequirement, 2_000);
  const criterion = cleanText(input.criterion, 1_000);
  const behaviours = Array.isArray(input.observableBehaviours)
    ? input.observableBehaviours.map((item) => cleanText(item, 1_000)).filter(Boolean).slice(0, 8)
    : [];
  return {
    reviewId: cleanText(input.reviewId, 120) || "role-evidence",
    sourceRequirement,
    criterion,
    origin: input.origin,
    entryRequirement: input.entryRequirement,
    importance: input.importance,
    consequence: input.consequence,
    observability: input.observability,
    aiCondition: input.aiCondition,
    observableBehaviours: behaviours,
    expectedCandidateEvidence: cleanText(input.expectedCandidateEvidence, 3_000),
    reviewerRationale: cleanText(input.reviewerRationale, 3_000),
    decision: input.decision,
    confirmed: input.confirmed === true,
  };
}

export function normaliseRoleEvidenceSourceKind(value: unknown): RoleEvidenceSourceKind {
  return isOneOf(value, ROLE_EVIDENCE_SOURCE_KINDS) ? value : "UPLOADED_JD";
}
