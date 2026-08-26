import { getScenarioContentHash, isValidationRunStale } from "../scenario-content-hash";
import type { ValidationFinding } from "./types";

type ReadinessScenario = {
  id: string;
  assessmentMode: unknown;
  validationRuns: Array<{ id: string; scenarioHash: string; status: string; findings: unknown }>;
  reviews: Array<{ validationRunId: string | null; reviewType: string; decision: string }>;
};

export type PublicationReadiness = {
  ready: boolean;
  currentHash: string;
  latestRunId: string | null;
  stale: boolean;
  blockers: string[];
};

type LatestValidationRun = ReadinessScenario["validationRuns"][number] | null;

function findings(value: unknown): ValidationFinding[] {
  return Array.isArray(value) ? (value as ValidationFinding[]) : [];
}

export function evaluatePublicationReadinessSnapshot(input: {
  currentHash: string;
  latest: LatestValidationRun;
  reviews: ReadinessScenario["reviews"];
}): PublicationReadiness {
  const { currentHash, latest, reviews } = input;
  const stale = isValidationRunStale(currentHash, latest?.scenarioHash);
  const blockers: string[] = [];
  if (!latest) blockers.push("Run the automated preflight.");
  else if (latest.status !== "COMPLETED") blockers.push("The latest automated preflight is not complete.");
  if (stale) blockers.push("The latest preflight is stale because scenario content changed.");
  if (latest) {
    const openBlockers = findings(latest.findings).filter((item) => item.severity === "blocker" && item.disposition === "open");
    if (openBlockers.length) blockers.push(`${openBlockers.length} unresolved preflight blocker(s) remain.`);
    const required = new Set(["SUBJECT_MATTER", "ASSESSMENT_DESIGN", "ACCESSIBILITY"]);
    for (const reviewType of Array.from(required)) {
      // Callers provide reviews newest-first. Only the latest decision for a
      // review type applies; an older approval cannot mask later changes.
      const latestReview = reviews.find((item) => item.validationRunId === latest.id && item.reviewType === reviewType);
      if (latestReview && latestReview.decision !== "CHANGES_REQUIRED") {
        required.delete(reviewType);
      }
    }
    if (required.size) blockers.push(`Human review required: ${Array.from(required).map((v) => v.toLowerCase().replace(/_/g, " ")).join(", ")}.`);
  }
  return { ready: blockers.length === 0, currentHash, latestRunId: latest?.id ?? null, stale, blockers };
}

export async function evaluatePublicationReadiness(scenario: ReadinessScenario): Promise<PublicationReadiness> {
  const currentHash = (await getScenarioContentHash(scenario.id)) ?? "";
  return evaluatePublicationReadinessSnapshot({
    currentHash,
    latest: scenario.validationRuns[0] ?? null,
    reviews: scenario.reviews,
  });
}
