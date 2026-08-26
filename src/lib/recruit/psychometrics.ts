export interface ReliabilityRating {
  candidateId: string;
  raterId: string;
  totalScore: number;
}

export interface RaterReliabilitySummary {
  doubleRatedCandidates: number;
  commonRaters: number;
  absoluteAgreementIcc: number | null;
  meanAbsoluteDifference: number | null;
  withinFiveMarksRate: number | null;
  note: string;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Descriptive two-way absolute-agreement ICC(A,1) for a balanced matrix of
 * completed total scores. An incomplete or changing rater panel returns null
 * rather than silently substituting a different statistic.
 */
export function summariseRaterReliability(
  ratings: ReliabilityRating[],
): RaterReliabilitySummary {
  const byCandidate = new Map<string, Map<string, number>>();
  for (const rating of ratings) {
    if (!Number.isFinite(rating.totalScore)) continue;
    const row = byCandidate.get(rating.candidateId) ?? new Map<string, number>();
    row.set(rating.raterId, rating.totalScore);
    byCandidate.set(rating.candidateId, row);
  }

  const completeCandidates = Array.from(byCandidate.entries()).filter(([, row]) => row.size >= 2);
  if (completeCandidates.length === 0) {
    return {
      doubleRatedCandidates: 0,
      commonRaters: 0,
      absoluteAgreementIcc: null,
      meanAbsoluteDifference: null,
      withinFiveMarksRate: null,
      note: "At least two candidates scored independently by the same two or more raters are required.",
    };
  }

  const commonRaterIds = Array.from(completeCandidates[0][1].keys()).filter((raterId) =>
    completeCandidates.every(([, row]) => row.has(raterId)),
  );
  const balanced = completeCandidates.filter(([, row]) =>
    commonRaterIds.every((raterId) => row.has(raterId)),
  );

  const pairDifferences: number[] = [];
  for (const [, row] of completeCandidates) {
    const values = Array.from(row.values());
    for (let left = 0; left < values.length; left += 1) {
      for (let right = left + 1; right < values.length; right += 1) {
        pairDifferences.push(Math.abs(values[left] - values[right]));
      }
    }
  }
  const meanAbsoluteDifference = pairDifferences.length
    ? pairDifferences.reduce((sum, value) => sum + value, 0) / pairDifferences.length
    : null;
  const withinFiveMarksRate = pairDifferences.length
    ? pairDifferences.filter((value) => value <= 5).length / pairDifferences.length
    : null;

  const n = balanced.length;
  const k = commonRaterIds.length;
  let icc: number | null = null;
  if (n >= 2 && k >= 2) {
    const matrix = balanced.map(([, row]) =>
      commonRaterIds.map((raterId) => row.get(raterId) as number),
    );
    const grand = matrix.flat().reduce((sum, value) => sum + value, 0) / (n * k);
    const rowMeans = matrix.map((row) => row.reduce((sum, value) => sum + value, 0) / k);
    const columnMeans = commonRaterIds.map((_, column) =>
      matrix.reduce((sum, row) => sum + row[column], 0) / n,
    );
    const msRows =
      (k * rowMeans.reduce((sum, value) => sum + (value - grand) ** 2, 0)) /
      (n - 1);
    const msColumns =
      (n * columnMeans.reduce((sum, value) => sum + (value - grand) ** 2, 0)) /
      (k - 1);
    let residual = 0;
    for (let row = 0; row < n; row += 1) {
      for (let column = 0; column < k; column += 1) {
        residual +=
          (matrix[row][column] - rowMeans[row] - columnMeans[column] + grand) ** 2;
      }
    }
    const msError = residual / ((n - 1) * (k - 1));
    const denominator =
      msRows + (k - 1) * msError + (k * (msColumns - msError)) / n;
    if (denominator !== 0) icc = round3((msRows - msError) / denominator);
  }

  return {
    doubleRatedCandidates: completeCandidates.length,
    commonRaters: commonRaterIds.length,
    absoluteAgreementIcc: icc,
    meanAbsoluteDifference:
      meanAbsoluteDifference == null ? null : round3(meanAbsoluteDifference),
    withinFiveMarksRate:
      withinFiveMarksRate == null ? null : round3(withinFiveMarksRate),
    note:
      icc == null
        ? "The completed ratings do not yet form a balanced common-rater matrix for ICC estimation."
        : "Descriptive pilot estimate only; interpretation and confidence intervals require a qualified psychometric review.",
  };
}

export const PSYCHOMETRIC_EVIDENCE_CATEGORIES = [
  "CONTENT",
  "RESPONSE_PROCESS",
  "RATER_RELIABILITY",
  "RELATIONS_TO_OTHER_VARIABLES",
  "FAIRNESS",
  "CONSEQUENCES",
] as const;

export function programmeReadiness(input: {
  intendedUse: string;
  targetPopulation: string;
  constructDefinition: string;
  decisionContext: string;
  pilotCohorts: number;
  distinctRaters: number;
}) {
  const gaps: string[] = [];
  if (!input.intendedUse.trim()) gaps.push("Intended score interpretation and use are not defined.");
  if (!input.targetPopulation.trim()) gaps.push("Target population is not defined.");
  if (!input.constructDefinition.trim()) gaps.push("Construct definition is not documented.");
  if (!input.decisionContext.trim()) gaps.push("Decision context is not documented.");
  if (input.pilotCohorts < 1) gaps.push("No version-matched pilot cohort is linked.");
  if (input.distinctRaters < 2) gaps.push("At least two independent raters are required.");
  return { ready: gaps.length === 0, gaps };
}
