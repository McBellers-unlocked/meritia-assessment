/**
 * Seed a disposable Data Scientist demo with real managed Python execution.
 *
 * Run after deploying the code-execution-enabled application:
 *   npx tsx scripts/seed-technical-demo.ts
 *   npx tsx scripts/seed-technical-demo.ts --teardown
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient, Prisma } from "@prisma/client";
import { ASSESSMENT_MODE_POLICY_VERSION } from "../src/lib/recruit/assessment-modes";
import { generateToken, indexToAnonymousId } from "../src/lib/recruit/tokens";
import {
  COHORT_TITLE,
  DELIVERABLE_LABEL,
  DELIVERABLE_PLACEHOLDER,
  EXHIBIT_HTML,
  EXHIBIT_SOURCE_ID,
  EXHIBIT_TITLE,
  KNOWLEDGE_SYSTEM_PROMPT,
  ORGANISATION,
  POSITION_TITLE,
  SLUG,
  TASK_BRIEF,
  TASK_RUBRIC,
  TASK_TITLE,
  TITLE,
  TOKEN_PREFIX,
  TOTAL_MINUTES,
} from "./technical-demo/scenario";

const prisma = new PrismaClient();
const BASE_URL = "https://www.uniqassess.org";
const WALKTHROUGH_CANDIDATES = [
  { name: "Alex Chen", email: "alex.chen@aster-demo.example" },
  { name: "Samira Patel", email: "samira.patel@aster-demo.example" },
  { name: "Jonas Meyer", email: "jonas.meyer@aster-demo.example" },
];

async function mintToken(): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const token = generateToken(TOKEN_PREFIX);
    if (!(await prisma.recruitmentCandidate.findUnique({ where: { token } }))) return token;
  }
  throw new Error("Could not mint a unique technical-demo token.");
}

async function teardown(): Promise<void> {
  if (SLUG !== "demo-data-scientist-python") throw new Error("Refusing teardown outside the technical-demo namespace.");
  const scenario = await prisma.recruitmentScenario.findUnique({
    where: { slug: SLUG },
    select: { id: true, assessments: { select: { id: true, title: true } } },
  });
  if (!scenario) {
    console.log("No technical demo scenario to remove.");
    return;
  }
  const foreign = scenario.assessments.filter((assessment) => !assessment.title.startsWith(COHORT_TITLE));
  if (foreign.length) throw new Error("Refusing teardown: the technical demo scenario has a non-demo cohort attached.");
  for (const assessment of scenario.assessments) {
    await prisma.recruitmentAssessment.delete({ where: { id: assessment.id } });
    console.log(`Deleted technical demo cohort ${assessment.id}.`);
  }
  await prisma.recruitmentAssessmentVersion.deleteMany({ where: { scenarioId: scenario.id } });
  await prisma.recruitmentScenario.delete({ where: { id: scenario.id } });
  console.log(`Deleted technical demo scenario ${scenario.id}.`);
}

async function seed(): Promise<void> {
  await teardown();
  const now = new Date();
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("An ADMIN user is required to own the technical demo.");

  const scenario = await prisma.recruitmentScenario.create({
    data: {
      slug: SLUG,
      title: TITLE,
      organisation: ORGANISATION,
      positionTitle: POSITION_TITLE,
      defaultTotalMinutes: TOTAL_MINUTES,
      status: "published",
      publishedAt: now,
      createdById: admin.id,
      assessmentMode: "COPILOT",
      modePolicyVersion: ASSESSMENT_MODE_POLICY_VERSION,
      defenceEnabled: false,
      defenceQuestionCount: 2,
      defenceMinutes: 5,
      roleEvidenceRecord: {
        version: 1,
        sourceType: "fictional_demo",
        reviewed: true,
        summary: "Synthetic demonstration of Python analysis, leakage diagnosis, subgroup evaluation and deployment judgement for a Data Scientist role.",
      } as Prisma.InputJsonValue,
      roleEvidenceReviewedById: admin.id,
      roleEvidenceReviewedAt: now,
    },
  });
  const exhibit = await prisma.recruitmentScenarioExhibit.create({
    data: {
      scenarioId: scenario.id,
      sourceId: EXHIBIT_SOURCE_ID,
      title: EXHIBIT_TITLE,
      html: EXHIBIT_HTML,
    },
  });
  const task = await prisma.recruitmentScenarioTask.create({
    data: {
      scenarioId: scenario.id,
      number: 1,
      kind: "memo_ai",
      title: TASK_TITLE,
      briefMarkdown: TASK_BRIEF,
      totalMarks: 100,
      systemPrompt: KNOWLEDGE_SYSTEM_PROMPT,
      exhibitId: exhibit.id,
      deliverableLabel: DELIVERABLE_LABEL,
      deliverablePlaceholder: DELIVERABLE_PLACEHOLDER,
      config: { codeExecutionEnabled: true },
      rubric: TASK_RUBRIC as Prisma.InputJsonValue,
    },
  });

  const criteria = await Promise.all([
    prisma.recruitmentScenarioCriterion.create({ data: { scenarioId: scenario.id, code: "PYTHON_ANALYSIS", name: "Reproducible Python analysis", description: "Writes and checks code that produces decision-relevant model diagnostics.", observableBehaviours: ["Runs inspectable Python", "Reconciles metrics", "Reports limitations"], order: 1 } }),
    prisma.recruitmentScenarioCriterion.create({ data: { scenarioId: scenario.id, code: "MODEL_RISK", name: "Model-risk diagnosis", description: "Identifies leakage, invalid validation design and uneven subgroup performance.", observableBehaviours: ["Detects post-outcome leakage", "Uses temporal validation", "Checks subgroup error rates"], order: 2 } }),
    prisma.recruitmentScenarioCriterion.create({ data: { scenarioId: scenario.id, code: "DEPLOYMENT_JUDGEMENT", name: "Deployment judgement", description: "Turns technical evidence into a proportionate engineering decision and remediation plan.", observableBehaviours: ["Makes a clear decision", "Defines remediation", "Sets re-validation and rollback criteria"], order: 3 } }),
  ]);
  await prisma.recruitmentScenarioCriterionTask.createMany({
    data: [
      { criterionId: criteria[0].id, taskId: task.id, expectedCandidateEvidence: "Executed Python, observed output and technically correct interpretation.", rubricElementIds: ["python_reproducibility", "subgroup_fnr", "metric_reconciliation"], marks: 35 },
      { criterionId: criteria[1].id, taskId: task.id, expectedCandidateEvidence: "Diagnosis of post-outcome leakage and invalid random-split validation.", rubricElementIds: ["post_outcome_leakage", "random_split_leakage", "sample_limits"], marks: 35 },
      { criterionId: criteria[2].id, taskId: task.id, expectedCandidateEvidence: "Explicit release decision with minimum remediation and re-validation plan.", rubricElementIds: ["engineering_judgement"], marks: 30 },
    ],
  });

  const { getOrCreateAssessmentVersion } = await import("../src/lib/recruit/assessment-versions");
  const version = await getOrCreateAssessmentVersion(scenario.id, admin.id);
  const assessment = await prisma.recruitmentAssessment.create({
    data: {
      title: COHORT_TITLE,
      scenarioSlug: SLUG,
      scenarioId: SLUG,
      customScenarioId: scenario.id,
      totalMinutes: TOTAL_MINUTES,
      openDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      closeDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      createdById: admin.id,
      assessmentMode: "COPILOT",
      modePolicyVersion: ASSESSMENT_MODE_POLICY_VERSION,
      defenceEnabled: false,
      defenceQuestionCount: 2,
      defenceMinutes: 5,
      assessmentVersionId: version.id,
    },
  });

  const links: string[] = [];
  for (let index = 0; index < WALKTHROUGH_CANDIDATES.length; index++) {
    const candidate = WALKTHROUGH_CANDIDATES[index];
    const token = await mintToken();
    await prisma.recruitmentCandidate.create({
      data: {
        assessmentId: assessment.id,
        name: candidate.name,
        email: candidate.email,
        token,
        anonymousId: indexToAnonymousId(index),
        status: "invited",
      },
    });
    links.push(`${candidate.name.padEnd(16)} ${BASE_URL}/assess/${SLUG}?token=${token}`);
  }

  console.log(`Created ${TITLE} (${scenario.id}) for ${admin.email}.`);
  console.log(`Cohort: ${assessment.id} · frozen ${version.scenarioHash.slice(0, 8)} · ${TOTAL_MINUTES} minutes`);
  console.log("Walkthrough links:");
  links.forEach((link) => console.log(`  ${link}`));
  console.log("Suggested first prompt:");
  console.log("  Use Python to load the validation CSV, compute the confusion matrix and false-negative rate by contract_type, and show the exact code and stdout. Then explain what the result means for tomorrow's release.");
}

const teardownOnly = process.argv.includes("--teardown");
(teardownOnly ? teardown() : seed())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
