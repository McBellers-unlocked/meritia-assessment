/**
 * Read-only sanity check for the seeded demo cohort. Recomputes exactly what
 * the reviewer UI derives at render time (work-provenance totals, message counts,
 * rubric normalisation, AI branding) so the demo can be checked from the
 * terminal without opening the admin UI.
 *
 * Run: npx tsx scripts/demo-cohort/verify.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { getScenarioContentHash } from "../../src/lib/recruit/scenario-content-hash";
import { SLUG, COHORT_TITLE } from "./scenario";

const prisma = new PrismaClient();
const DEMO_VARIANTS = [
  { slug: SLUG, mode: "EVIDENCE", label: "Evidence Mode" },
  { slug: `${SLUG}-copilot`, mode: "COPILOT", label: "Copilot Mode" },
  { slug: `${SLUG}-open-agent`, mode: "OPEN_AGENT", label: "Open Agent Mode" },
] as const;

async function main() {
  const scenario = await prisma.recruitmentScenario.findUnique({
    where: { slug: SLUG },
    include: {
      tasks: { orderBy: { number: "asc" }, include: { exhibit: true } },
      chatScripts: true,
    },
  });
  if (!scenario) throw new Error(`scenario ${SLUG} not found — run the seed first`);

  // AI brand derivation (scenario-loader.ts deriveAssistantBrand)
  const m = scenario.organisation.match(/\(([A-Za-z][A-Za-z0-9&-]{1,7})\)/);
  console.log(`scenario: ${scenario.title} [${scenario.status}]`);
  console.log(`  AI brand: ${m ? `${m[1]} Knowledge System` : "(NONE — would fall back to IDSC!)"}`);

  // Publish invariants + rubric normalisation (rubric.ts loadRubricForAssessment)
  let total = 0;
  for (const t of scenario.tasks) {
    total += t.totalMarks;
    const cats = (t.rubric ?? {}) as Record<string, { max?: number; embedded_issues?: { id: string }[] }>;
    const issues = Object.values(cats).flatMap((c) => c.embedded_issues ?? []).map((i) => i.id);
    const problems: string[] = [];
    if (t.kind === "memo_ai") {
      if (!t.systemPrompt) problems.push("no systemPrompt");
      if (!t.exhibitId) problems.push("no exhibit");
      if (!t.deliverableLabel) problems.push("no deliverableLabel");
    }
    if (t.kind === "chat" && scenario.chatScripts.filter((s) => s.taskId === t.id).length !== 1) {
      problems.push("chat task needs exactly one script");
    }
    console.log(
      `  task ${t.number} (${t.kind}) "${t.title}" — ${t.totalMarks} marks` +
        (issues.length ? `, rubric issues: ${issues.join(", ")}` : "") +
        (problems.length ? `  !! ${problems.join("; ")}` : "")
    );
  }
  console.log(`  rubric total_marks: ${total}${total === 100 ? "" : "  !! expected 100"}`);
  const script = scenario.chatScripts[0];
  if (script) {
    console.log(
      `  IM: ${script.personaName} (${script.personaRole}) fires at ${script.triggerOffsetSeconds}s, maxTurns ${script.maxTurns}`
    );
  }

  const assessment = await prisma.recruitmentAssessment.findFirst({
    where: { scenarioSlug: SLUG, title: COHORT_TITLE },
    orderBy: { createdAt: "desc" },
  });
  if (!assessment) throw new Error("demo cohort not found");
  console.log(
    `\ncohort ${assessment.id}: ${assessment.totalMinutes} min, open ${assessment.openDate.toISOString().slice(0, 10)} → close ${assessment.closeDate.toISOString().slice(0, 10)}, revealed: ${assessment.revealedAt ? "YES !!" : "no (blind)"}`
  );

  console.log(
    `  policy snapshot: ${assessment.assessmentMode}, policy v${assessment.modePolicyVersion}, ` +
      `defence ${assessment.defenceEnabled ? `${assessment.defenceQuestionCount} questions / ${assessment.defenceMinutes} min` : "off"}`
  );

  const candidates = await prisma.recruitmentCandidate.findMany({
    where: { assessmentId: assessment.id },
    orderBy: { anonymousId: "asc" },
    include: {
      responses: true,
      interactions: { orderBy: { sequenceNum: "asc" } },
      activityEvents: { orderBy: { occurredAt: "asc" } },
      evidenceBoard: { orderBy: { createdAt: "asc" } },
      defence: true,
    },
  });

  const submitted = candidates.filter((c) => c.status === "submitted");
  const invited = candidates.filter((c) => c.status === "invited");
  console.log(`candidates: ${submitted.length} submitted (marking list), ${invited.length} invited (spares)\n`);

  const header =
    "anon         time  score  msgs(all/cand)  memo(words,sent)  tab1 tiles: pastes/chars · tab-aways · off-tab  chat";
  console.log(header);
  console.log("-".repeat(header.length));
  for (const c of submitted) {
    const timeMin =
      c.startedAt && c.submittedAt ? Math.round((c.submittedAt.getTime() - c.startedAt.getTime()) / 60_000) : null;
    const candMsgs = c.interactions.filter((i) => i.actor === "candidate").length;
    const chatMsgs = c.interactions.filter((i) => i.taskNumber === 2).length;
    const resp = c.responses.find((r) => r.taskNumber === 1);

    // Reviewer tab-1 event filter: taskNumber === 1 || taskNumber === null
    const tab1 = c.activityEvents.filter((e) => e.taskNumber === 1 || e.taskNumber === null);
    const pastes = tab1.filter((e) => e.eventType === "paste");
    const pasteChars = pastes.reduce(
      (s, e) => s + ((e.metadata as { charCount?: number } | null)?.charCount ?? 0),
      0
    );
    const hiddenCount = tab1.filter((e) => e.eventType === "visibility_hidden").length;
    const hiddenMs = tab1
      .filter((e) => e.eventType === "visibility_visible")
      .reduce((s, e) => s + ((e.metadata as { hiddenMs?: number } | null)?.hiddenMs ?? 0), 0);
    const offTab =
      hiddenMs >= 60_000
        ? `${Math.floor(hiddenMs / 60_000)}m ${Math.round((hiddenMs % 60_000) / 1000)}s`
        : `${Math.round(hiddenMs / 1000)}s`;
    const chatOpened = c.activityEvents.some((e) => e.eventType === "chat_opened");
    const chatState = chatMsgs > 0 ? `${chatMsgs} msgs` : chatOpened ? "opened, silent" : "never opened";

    console.log(
      `${c.anonymousId.padEnd(12)} ${String(timeMin + "m").padEnd(5)} ${String(c.totalScore ?? "—").padEnd(6)} ` +
        `${String(c.interactions.length + "/" + candMsgs).padEnd(15)} ` +
        `${String((resp?.wordCount ?? 0) + "w" + (resp?.sentAt ? ",sent" : ",draft")).padEnd(17)} ` +
        `${pastes.length}/${pasteChars.toLocaleString().padEnd(6)} · ${String(hiddenCount).padEnd(2)} · ${offTab.padEnd(8)} ${chatState}`
    );
    const structuredAi = c.interactions.filter(
      (interaction) => interaction.actor === "ai" && interaction.structuredPayload != null
    );
    const candidateProblems: string[] = [];
    if (!c.workLockedAt || !c.submittedAt || c.workLockedAt > c.submittedAt) {
      candidateProblems.push("main work was not locked before final submission");
    }
    if (!c.defence?.submittedAt) candidateProblems.push("defence is not submitted");
    if (!Array.isArray(c.defence?.questions) || c.defence.questions.length !== 2) {
      candidateProblems.push("defence does not contain exactly two questions");
    }
    if (!Array.isArray(c.defence?.answers) || c.defence.answers.length !== 2) {
      candidateProblems.push("defence does not contain exactly two answers");
    }
    if (structuredAi.length < 1) candidateProblems.push("no structured evidence response");
    if (c.evidenceBoard.length < 1) candidateProblems.push("evidence board is empty");
    if (c.evidenceBoard.some((evidence) => !evidence.interactionId || !evidence.sourceId)) {
      candidateProblems.push("evidence lineage is incomplete");
    }
    for (const requiredEvent of ["evidence_saved", "defence_started", "defence_submitted", "final_submission"]) {
      if (!c.activityEvents.some((event) => event.eventType === requiredEvent)) {
        candidateProblems.push(`${requiredEvent} provenance event is missing`);
      }
    }
    if (
      resp?.markedAt &&
      (!resp.criterionScores ||
        typeof resp.criterionScores !== "object" ||
        Array.isArray(resp.criterionScores) ||
        Object.keys(resp.criterionScores).length !== 2)
    ) {
      candidateProblems.push("human criterion scores are missing from a marked response");
    }
    if (candidateProblems.length) {
      throw new Error(`${c.anonymousId}: ${candidateProblems.join("; ")}`);
    }
  }

  console.log(`\nspares (invited, excluded from marking list): ${invited.map((c) => `${c.anonymousId} ${c.token}`).join(", ")}`);

  // Ranking as the results page orders it
  const ranked = submitted
    .filter((c) => c.totalScore != null)
    .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))
    .map((c) => `${c.anonymousId} ${c.totalScore}`);
  console.log(`ranking: ${ranked.join("  |  ")}  (+${submitted.filter((c) => c.totalScore == null).length} unmarked)`);

  console.log("\nAI-era framework relationships:");
  const variants = await prisma.recruitmentScenario.findMany({
    where: { slug: { in: DEMO_VARIANTS.map((variant) => variant.slug) } },
    include: {
      exhibits: true,
      criteria: { include: { taskMappings: true } },
      validationRuns: { orderBy: { createdAt: "desc" }, take: 1 },
      reviews: { orderBy: { createdAt: "asc" } },
    },
  });

  for (const expected of DEMO_VARIANTS) {
    const variant = variants.find((item) => item.slug === expected.slug);
    if (!variant) throw new Error(`${expected.label}: scenario is missing`);
    const problems: string[] = [];
    const currentHash = await getScenarioContentHash(variant.id);
    const latestRun = variant.validationRuns[0];
    const findings = Array.isArray(latestRun?.findings)
      ? (latestRun.findings as Array<Record<string, unknown>>)
      : [];
    const reviewTypes = new Set(variant.reviews.map((review) => review.reviewType));
    const mappings = variant.criteria.flatMap((criterion) => criterion.taskMappings);
    const mappingMarks = mappings.reduce((sum, mapping) => sum + mapping.marks, 0);

    if (variant.assessmentMode !== expected.mode) problems.push(`mode is ${variant.assessmentMode}`);
    if (!variant.defenceEnabled || variant.defenceQuestionCount !== 2) problems.push("defence configuration is incomplete");
    if (!variant.exhibits.some((exhibit) => exhibit.sourceId)) problems.push("stable exhibit source ID is missing");
    if (variant.criteria.length !== 3) problems.push(`expected 3 criteria, found ${variant.criteria.length}`);
    if (variant.criteria.some((criterion) => criterion.taskMappings.length === 0)) problems.push("unmapped criterion found");
    if (mappingMarks !== 100) problems.push(`criterion mapping marks total ${mappingMarks}, expected 100`);
    if (!latestRun || latestRun.status !== "COMPLETED") problems.push("completed preflight is missing");
    if (!currentHash || latestRun?.scenarioHash !== currentHash) problems.push("latest preflight is stale");
    if (!latestRun?.scenarioSnapshot) problems.push("immutable validation input snapshot is missing");
    if (!Array.isArray(latestRun?.syntheticProfiles) || latestRun.syntheticProfiles.length !== 3) {
      problems.push("Developing/Competent/Strong synthetic profiles are missing");
    }
    if (!Array.isArray(latestRun?.policyTests) || latestRun.policyTests.length < 3) {
      problems.push("Knowledge System policy tests are missing");
    }
    if (!findings.some((finding) => finding.severity === "blocker" && finding.disposition === "resolved")) {
      problems.push("human-resolved demonstration blocker is missing");
    }
    for (const required of ["SUBJECT_MATTER", "ASSESSMENT_DESIGN", "ACCESSIBILITY"] as const) {
      if (!reviewTypes.has(required)) problems.push(`${required} review is missing`);
    }

    if (problems.length) throw new Error(`${expected.label}: ${problems.join("; ")}`);
    console.log(
      `  pass ${expected.label}: current preflight, ${variant.criteria.length} criteria / ` +
        `${mappings.length} mappings, 3 human reviews`
    );
  }

  const dispositions = new Set(
    submitted.flatMap((candidate) => candidate.evidenceBoard.map((card) => card.candidateDisposition))
  );
  console.log(
    `  pass candidate evidence + defence: ${submitted.length} locked submissions, dispositions ${Array.from(dispositions).sort().join(", ")}`
  );
}

main()
  .catch((e) => {
    console.error("VERIFY ERROR:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
