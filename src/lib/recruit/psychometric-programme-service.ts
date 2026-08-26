import { prisma } from "@/lib/prisma";
import { getScenarioContentHash } from "./scenario-content-hash";
import { programmeReadiness, summariseRaterReliability } from "./psychometrics";

export async function loadPsychometricProgrammeDashboard(scenarioId: string) {
  const [currentHash, programmes, assessments, raters] = await Promise.all([
    getScenarioContentHash(scenarioId),
    prisma.recruitmentPsychometricProgramme.findMany({
      where: { scenarioId },
      orderBy: { createdAt: "desc" },
      include: {
        assessmentVersion: {
          select: {
            id: true,
            label: true,
            scenarioHash: true,
            assessmentMode: true,
            modePolicyVersion: true,
            createdAt: true,
          },
        },
        evidenceRecords: { orderBy: { category: "asc" } },
        pilotCohorts: {
          orderBy: { includedAt: "asc" },
          include: {
            assessment: {
              select: {
                id: true,
                title: true,
                openDate: true,
                closeDate: true,
                assessmentVersionId: true,
                candidates: { select: { status: true } },
              },
            },
          },
        },
        raterAssignments: {
          orderBy: [{ candidate: { anonymousId: "asc" } }, { sequence: "asc" }],
          include: {
            candidate: { select: { id: true, anonymousId: true } },
            rater: { select: { id: true, name: true, email: true } },
            ratings: { select: { score: true, submittedAt: true } },
          },
        },
      },
    }),
    prisma.recruitmentAssessment.findMany({
      where: { customScenarioId: scenarioId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        openDate: true,
        closeDate: true,
        assessmentVersionId: true,
        candidates: { select: { status: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "ADMIN" },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
    }),
  ]);

  return {
    currentHash,
    programmes: programmes.map((programme) => {
      const distinctRaters = new Set(programme.raterAssignments.map((assignment) => assignment.raterId));
      const reliabilityRatings = programme.raterAssignments
        .filter((assignment) => assignment.status === "SUBMITTED")
        .map((assignment) => ({
          candidateId: assignment.candidateId,
          raterId: assignment.raterId,
          totalScore: assignment.ratings.reduce((sum, rating) => sum + rating.score, 0),
        }));
      return {
        ...programme,
        versionCurrent: programme.assessmentVersion.scenarioHash === currentHash,
        readiness: programmeReadiness({
          intendedUse: programme.intendedUse,
          targetPopulation: programme.targetPopulation,
          constructDefinition: programme.constructDefinition,
          decisionContext: programme.decisionContext,
          pilotCohorts: programme.pilotCohorts.length,
          distinctRaters: distinctRaters.size,
        }),
        reliability: summariseRaterReliability(reliabilityRatings),
        pilotCohorts: programme.pilotCohorts.map((link) => ({
          ...link,
          assessment: {
            ...link.assessment,
            counts: countCandidateStatuses(link.assessment.candidates),
            candidates: undefined,
          },
        })),
        raterAssignments: programme.raterAssignments.map(({ ratings: _ratings, ...assignment }) => assignment),
        assignmentSummary: {
          total: programme.raterAssignments.length,
          assigned: programme.raterAssignments.filter((item) => item.status === "ASSIGNED").length,
          inProgress: programme.raterAssignments.filter((item) => item.status === "IN_PROGRESS").length,
          submitted: programme.raterAssignments.filter((item) => item.status === "SUBMITTED").length,
          distinctRaters: distinctRaters.size,
        },
      };
    }),
    assessments: assessments.map((assessment) => ({
      ...assessment,
      counts: countCandidateStatuses(assessment.candidates),
      candidates: undefined,
    })),
    raters,
  };
}

function countCandidateStatuses(candidates: Array<{ status: string }>) {
  const counts = { invited: 0, started: 0, defence: 0, submitted: 0, expired: 0 };
  for (const candidate of candidates) {
    if (candidate.status in counts) {
      counts[candidate.status as keyof typeof counts] += 1;
    }
  }
  return counts;
}
