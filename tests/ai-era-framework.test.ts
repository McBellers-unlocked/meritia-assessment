import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSESSMENT_MODES,
  buildCohortPolicySnapshot,
  buildKnowledgePolicy,
  getAssessmentModePolicy,
  resolveAssessmentMode,
} from "../src/lib/recruit/assessment-modes";
import { parseKnowledgeSystemResponse } from "../src/lib/recruit/knowledge-response-schema";
import {
  responseUsedManagedCodeExecution,
  taskHasManagedCodeExecution,
} from "../src/lib/recruit/code-execution";
import { VALIDATION_CSV } from "../scripts/technical-demo/scenario";
import {
  excerptMatchesSource,
  makeSourceId,
  validateKnowledgeSources,
} from "../src/lib/recruit/source-verification";
import {
  canonicalJson,
  hashScenarioSnapshot,
  isValidationRunStale,
} from "../src/lib/recruit/scenario-content-hash";
import { runDeterministicChecks } from "../src/lib/recruit/validation/deterministic";
import {
  defenceDeadline,
  fallbackDefenceQuestions,
  normaliseDefenceQuestions,
  autosaveDefenceAnswer,
} from "../src/lib/recruit/defence";
import {
  provenanceEventLabel,
  summariseWorkProvenance,
  WORK_PROVENANCE_POLICY_NOTE,
} from "../src/lib/recruit/provenance";
import { analyzeTextReuse } from "../src/lib/recruit/textReuse";
import { evaluatePublicationReadinessSnapshot } from "../src/lib/recruit/validation/publication-readiness";
import { blindCandidateIdentity } from "../src/lib/recruit/blind-marking";
import { candidateOwnedInteractionWhere, candidateOwnedRecordWhere } from "../src/lib/recruit/candidate-record-scope";
import { DEMO_CANDIDATES } from "../scripts/demo-cohort/candidates";
import {
  programmeReadiness,
  summariseRaterReliability,
} from "../src/lib/recruit/psychometrics";
import {
  ROLE_EVIDENCE_DISCLAIMER,
  createRoleEvidenceReview,
  normaliseRoleEvidenceReview,
  normaliseRoleEvidenceSourceKind,
  roleEvidenceReadiness,
  roleEvidenceWarnings,
} from "../src/lib/recruit/role-evidence";

const structuredFixture = {
  analysisSummary: "The headline needs to be tested against the function breakdown.",
  evidenceCards: [
    {
      id: "card-1",
      claim: "Customer Operations fell from 8.1 to 5.9.",
      sourceId: "PEOPLE-PULSE",
      sourceTitle: "People Pulse",
      sourceExcerpt: "Customer Operations fell from 8.1 to 5.9 in Q2.",
      relationship: "supports",
      basis: "direct_evidence",
      confidence: "high",
      explanation: "The function result drives the material change.",
    },
    {
      id: "card-2",
      claim: "A management practice may be contributing.",
      sourceId: "made-up",
      sourceTitle: "Made up",
      sourceExcerpt: "This does not exist.",
      relationship: "context",
      basis: "inference",
      confidence: "low",
      explanation: "This is a hypothesis, not a finding.",
    },
  ],
  uncertainties: ["Participation differs by shift."],
  questionsToResolve: ["What does the roster cut show?"],
  workingDraft: { label: "AI-generated working draft", content: "A draft paragraph." },
};

test("all declared assessment modes resolve to complete policies", () => {
  assert.deepEqual(ASSESSMENT_MODES, ["EVIDENCE", "COPILOT", "OPEN_AGENT"]);
  for (const mode of ASSESSMENT_MODES) {
    const policy = getAssessmentModePolicy(mode);
    assert.equal(policy.mode, mode);
    assert.match(policy.candidateInstructions, /AI-powered|AI tools/);
  }
  assert.equal(resolveAssessmentMode(undefined), "EVIDENCE");
  assert.equal(resolveAssessmentMode("legacy-value"), "EVIDENCE");
});

test("cohort policy is an immutable value snapshot with safe legacy defaults", () => {
  const editable = {
    assessmentMode: "COPILOT" as const,
    modePolicyVersion: "7",
    defenceEnabled: true,
    defenceQuestionCount: 2,
    defenceMinutes: 8,
  };
  const snapshot = buildCohortPolicySnapshot(editable);
  editable.assessmentMode = "OPEN_AGENT" as never;
  editable.defenceMinutes = 12;
  assert.equal(snapshot.assessmentMode, "COPILOT");
  assert.equal(snapshot.defenceMinutes, 8);
  assert.deepEqual(buildCohortPolicySnapshot(undefined), {
    assessmentMode: "EVIDENCE",
    modePolicyVersion: "1",
    defenceEnabled: false,
    defenceQuestionCount: 2,
    defenceMinutes: 5,
  });
});

test("Evidence and Copilot modes produce different drafting boundaries", () => {
  assert.match(buildKnowledgePolicy("EVIDENCE"), /Never produce the final deliverable/);
  assert.match(buildKnowledgePolicy("COPILOT"), /clearly labelled AI-generated working material/);
});

test("structured Knowledge System parsing strips drafts in Evidence Mode", () => {
  const evidence = parseKnowledgeSystemResponse(structuredFixture, "EVIDENCE");
  assert.equal(evidence.ok, true);
  if (evidence.ok) assert.equal(evidence.value.workingDraft, null);
  const copilot = parseKnowledgeSystemResponse(structuredFixture, "COPILOT");
  assert.equal(copilot.ok, true);
  if (copilot.ok) assert.equal(copilot.value.workingDraft?.content, "A draft paragraph.");
  assert.equal(parseKnowledgeSystemResponse(null, "EVIDENCE").ok, false);
});

test("source IDs, excerpts and unverified citations are handled conservatively", () => {
  assert.equal(makeSourceId("People Pulse: Q2", 2), "PEOPLE-PULSE-Q2-2");
  const sourceText = "People Pulse. Customer Operations fell from 8.1 to 5.9 in Q2. Participation was lower.";
  assert.equal(excerptMatchesSource("Customer Operations fell from 8.1 to 5.9 in Q2.", sourceText), true);
  assert.equal(excerptMatchesSource("A claim that is absent from all supplied material.", sourceText), false);
  assert.equal(excerptMatchesSource("People Pulse Customer Operations 8.1 5.9 Participation lower", "People Pulse has unrelated text. Customer Operations fell from 8.1 to 5.9. Much later, Participation was lower."), false);
  const parsed = parseKnowledgeSystemResponse(structuredFixture, "COPILOT");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const checked = validateKnowledgeSources(parsed.value, [{ id: "PEOPLE-PULSE", title: "People Pulse", text: sourceText }]);
  assert.equal(checked.evidenceCards[0].verificationStatus, "verified");
  assert.equal(checked.evidenceCards[1].verificationStatus, "inference");
  const missing = validateKnowledgeSources(
    { ...parsed.value, evidenceCards: [{ ...parsed.value.evidenceCards[0], sourceId: "UNKNOWN" }] },
    [{ id: "PEOPLE-PULSE", title: "People Pulse", text: sourceText }]
  );
  assert.equal(missing.evidenceCards[0].verificationStatus, "unverified");
});

test("scenario hashing is canonical and validation staleness follows content", () => {
  const first = { mode: "EVIDENCE", tasks: [{ number: 1, title: "Memo" }] };
  const reordered = { tasks: [{ title: "Memo", number: 1 }], mode: "EVIDENCE" };
  assert.equal(canonicalJson(first), canonicalJson(reordered));
  const hash = hashScenarioSnapshot(first);
  assert.equal(hash, hashScenarioSnapshot(reordered));
  assert.equal(isValidationRunStale(hash, hash), false);
  assert.equal(isValidationRunStale(hashScenarioSnapshot({ ...first, mode: "COPILOT" }), hash), true);
  assert.equal(isValidationRunStale(hash, null), true);
});

test("deterministic preflight creates publication blockers for incomplete design", () => {
  const result = runDeterministicChecks({
    assessmentMode: "EVIDENCE",
    defaultTotalMinutes: 30,
    defenceEnabled: false,
    defenceQuestionCount: 2,
    defenceMinutes: 5,
    exhibits: [],
    tasks: [{ id: "task-1", number: 1, kind: "memo_ai", title: "Memo", briefMarkdown: "Write a note", totalMarks: 100, systemPrompt: "Retrieve facts", exhibitId: null, rubric: null }],
    criteria: [],
  });
  const blockerIds = result.findings.filter((finding) => finding.severity === "blocker").map((finding) => finding.id);
  assert.ok(blockerIds.includes("det-scored-rubrics"));
  assert.ok(blockerIds.includes("det-required-exhibits"));
  assert.ok(blockerIds.includes("det-criterion-mapping"));
});

test("deterministic preflight traces rubric elements and embedded-issue evidence", () => {
  const result = runDeterministicChecks({
    assessmentMode: "EVIDENCE",
    defaultTotalMinutes: 30,
    defenceEnabled: false,
    defenceQuestionCount: 2,
    defenceMinutes: 5,
    exhibits: [{ id: "exhibit-1", sourceId: "SOURCE-1", title: "Source" }],
    tasks: [{
      id: "task-1", number: 1, kind: "memo_ai", title: "Memo", briefMarkdown: "Write a note",
      totalMarks: 100, systemPrompt: "Retrieve facts", exhibitId: "exhibit-1",
      rubric: { quality: { max: 100, embedded_issues: [{ id: "issue-without-lineage" }] } },
    }],
    criteria: [{
      id: "criterion-1", code: "CRIT-01", name: "Judgement", observableBehaviours: ["Makes a decision"],
      taskMappings: [{ taskId: "task-1", expectedCandidateEvidence: "A reasoned decision", rubricElementIds: [], marks: 100 }],
    }],
  });
  const blockerIds = result.findings.filter((finding) => finding.severity === "blocker").map((finding) => finding.id);
  assert.ok(blockerIds.includes("det-rubric-criterion-links"));
  assert.ok(blockerIds.includes("det-embedded-issue-lineage"));
});

test("defence fallbacks are always two questions and deadline is bounded", () => {
  const fallback = fallbackDefenceQuestions();
  assert.equal(fallback.length, 2);
  assert.deepEqual(normaliseDefenceQuestions(fallback), fallback);
  assert.equal(normaliseDefenceQuestions(["one"]), null);
  const start = new Date("2026-08-25T10:00:00.000Z");
  assert.equal(defenceDeadline(start, 5).toISOString(), "2026-08-25T10:05:00.000Z");
  assert.equal(defenceDeadline(start, 100).toISOString(), "2026-08-25T10:30:00.000Z");
  const answers = fallback.map((question) => ({ questionId: question.id, text: "", savedAt: null }));
  const saved = autosaveDefenceAnswer(answers, "defence-1", "Reasoned answer", "2026-08-25T10:01:00.000Z");
  assert.equal(saved?.[0].text, "Reasoned answer");
  assert.equal(saved?.[1].text, "");
  assert.equal(autosaveDefenceAnswer(answers, "not-owned", "x", "now"), null);
});

test("publication readiness blocks stale or unresolved validation and requires all human reviews", () => {
  const currentHash = "current-hash";
  const latest = { id: "run-1", scenarioHash: currentHash, status: "COMPLETED", findings: [] };
  const reviews = [
    { validationRunId: "run-1", reviewType: "SUBJECT_MATTER", decision: "APPROVED" },
    { validationRunId: "run-1", reviewType: "ASSESSMENT_DESIGN", decision: "APPROVED" },
    { validationRunId: "run-1", reviewType: "ACCESSIBILITY", decision: "APPROVED_WITH_LIMITATIONS" },
  ];
  assert.equal(evaluatePublicationReadinessSnapshot({ currentHash, latest, reviews }).ready, true);
  assert.equal(evaluatePublicationReadinessSnapshot({ currentHash: "changed", latest, reviews }).stale, true);
  const unresolved = {
    ...latest,
    findings: [{ severity: "blocker", disposition: "open" }],
  };
  assert.equal(evaluatePublicationReadinessSnapshot({ currentHash, latest: unresolved, reviews }).ready, false);
  assert.match(evaluatePublicationReadinessSnapshot({ currentHash, latest, reviews: reviews.slice(0, 2) }).blockers.join(" "), /accessibility/i);
  assert.equal(evaluatePublicationReadinessSnapshot({
    currentHash,
    latest,
    reviews: [{ validationRunId: "run-1", reviewType: "ACCESSIBILITY", decision: "CHANGES_REQUIRED" }, ...reviews],
  }).ready, false);
});

test("candidate-owned records and pre-reveal identity remain server-scoped", () => {
  assert.deepEqual(candidateOwnedRecordWhere("candidate-a", "evidence-1"), { id: "evidence-1", candidateId: "candidate-a" });
  assert.deepEqual(candidateOwnedInteractionWhere("candidate-a", "interaction-1"), { id: "interaction-1", candidateId: "candidate-a", actor: "ai" });
  const candidate = { name: "Private Name", email: "private@example.test" };
  assert.deepEqual(blindCandidateIdentity(candidate, false), { name: null, email: null });
  assert.deepEqual(blindCandidateIdentity(candidate, true), candidate);
});

test("work provenance uses neutral labels and preserves counts", () => {
  const summary = summariseWorkProvenance(
    [
      { eventType: "paste", metadata: { charCount: 2850 } },
      { eventType: "visibility_hidden", metadata: null },
      { eventType: "visibility_visible", metadata: { hiddenMs: 630_000 } },
    ],
    1,
    [{ candidateDisposition: "CHECKED" }, { candidateDisposition: "REJECTED" }]
  );
  assert.deepEqual(summary, {
    pasteCount: 1,
    pastedCharacters: 2850,
    focusChanges: 1,
    focusChangedMs: 630_000,
    knowledgeQuestions: 1,
    evidenceSaved: 2,
    evidenceChecked: 1,
    evidenceRejected: 1,
  });
  assert.equal(provenanceEventLabel("visibility_hidden"), "Focus changed away from the workspace");
  assert.match(WORK_PROVENANCE_POLICY_NOTE, /not be treated as proof of misconduct/);
});

test("legacy lexical overlap remains deterministic without becoming a score", () => {
  const copied = "Customer Operations fell from 8.1 to 5.9 in a single quarter.";
  const result = analyzeTextReuse(`<p>${copied}</p>`, [copied]);
  assert.equal(result.numReusedSentences, 1);
  assert.equal(result.reuseRatio, 1);
  const unrelated = analyzeTextReuse("<p>I would first commission a confidential review.</p>", [copied]);
  assert.equal(unrelated.numReusedSentences, 0);
});

test("managed code execution is opt-in and detects completed server execution", () => {
  assert.equal(taskHasManagedCodeExecution(null), false);
  assert.equal(taskHasManagedCodeExecution({ codeExecutionEnabled: false }), false);
  assert.equal(taskHasManagedCodeExecution({ codeExecutionEnabled: true }), true);
  assert.equal(responseUsedManagedCodeExecution([{ type: "text", text: "generated only" }]), false);
  assert.equal(
    responseUsedManagedCodeExecution([
      { type: "server_tool_use", name: "bash_code_execution", input: { command: "python3 analysis.py" } },
      { type: "bash_code_execution_tool_result", content: { stdout: "ok" } },
    ]),
    true,
  );
});

test("technical demo validation sample has the intended subgroup false-negative rates", () => {
  const [header, ...lines] = VALIDATION_CSV.trim().split(/\r?\n/);
  const columns = header.split(",");
  const rows = lines.map((line) =>
    Object.fromEntries(columns.map((column, index) => [column, line.split(",")[index]])),
  );
  const fnr = (contract: string) => {
    const positives = rows.filter((row) => row.contract_type === contract && row.churned === "1");
    const falseNegatives = positives.filter((row) => row.predicted_churn === "0");
    return falseNegatives.length / positives.length;
  };
  assert.equal(rows.length, 24);
  assert.equal(fnr("monthly"), 1 / 6);
  assert.equal(fnr("annual"), 3 / 6);
});

test("role evidence proposals require accountable human confirmation", () => {
  const review = createRoleEvidenceReview({
    criterion: "Advise managers on complex employee relations cases",
    origin: "ESSENTIAL",
    index: 0,
    assessmentMode: "EVIDENCE",
  });
  assert.equal(review.entryRequirement, "REQUIRED_AT_ENTRY");
  assert.equal(review.importance, "CORE");
  assert.equal(review.aiCondition, "EVIDENCE");
  assert.equal(roleEvidenceReadiness([review]).ready, false);
  const confirmed = { ...review, confirmed: true };
  assert.equal(roleEvidenceReadiness([confirmed]).ready, true);
  assert.match(ROLE_EVIDENCE_DISCLAIMER, /not a completed job analysis or psychometric validation/i);
});

test("role evidence warnings expose design trade-offs and inputs are normalised", () => {
  const review = {
    ...createRoleEvidenceReview({ criterion: "Prepare internal guidance", origin: "DESIRABLE", index: 1, assessmentMode: "COPILOT" }),
    entryRequirement: "LEARNABLE_AFTER_APPOINTMENT" as const,
    observability: "NOT_OBSERVABLE" as const,
    aiCondition: "OPEN_AGENT" as const,
    confirmed: true,
  };
  const messages = roleEvidenceWarnings(review, "COPILOT").map((warning) => warning.message).join(" ");
  assert.match(messages, /learnable after appointment/i);
  assert.match(messages, /not observable/i);
  assert.match(messages, /does not match/i);
  assert.deepEqual(normaliseRoleEvidenceReview({ ...review, observableBehaviours: ["  Behaviour one  "] })?.observableBehaviours, ["Behaviour one"]);
  assert.equal(normaliseRoleEvidenceSourceKind("WIPO"), "WIPO");
  assert.equal(normaliseRoleEvidenceSourceKind("unknown"), "UPLOADED_JD");
});

test("marked Halcyon demo spans visible-output overlap without eliminating genuine zeroes", () => {
  const percentages = DEMO_CANDIDATES
    .filter((candidate) => candidate.marks != null)
    .map((candidate) => {
      const visibleAiOutput = candidate.memoTrail
        .filter((message) => message.actor === "ai")
        .map((message) => message.content);
      return Math.round(analyzeTextReuse(candidate.memoHtml, visibleAiOutput).reuseRatio * 100);
    })
    .sort((a, b) => a - b);

  assert.deepEqual(percentages, [0, 0, 7, 14, 44]);
});

test("validation programme readiness requires a delimited claim, pilot and two raters", () => {
  const incomplete = programmeReadiness({
    intendedUse: "",
    targetPopulation: "UK applicants",
    constructDefinition: "Evidence-based judgement",
    decisionContext: "Human-reviewed selection",
    pilotCohorts: 0,
    distinctRaters: 1,
  });
  assert.equal(incomplete.ready, false);
  assert.equal(incomplete.gaps.length, 3);
  const ready = programmeReadiness({
    intendedUse: "Support structured selection decisions",
    targetPopulation: "UK applicants",
    constructDefinition: "Evidence-based judgement",
    decisionContext: "Human-reviewed selection",
    pilotCohorts: 1,
    distinctRaters: 2,
  });
  assert.deepEqual(ready, { ready: true, gaps: [] });
});

test("balanced independent ratings produce descriptive absolute-agreement reliability", () => {
  const summary = summariseRaterReliability([
    { candidateId: "a", raterId: "r1", totalScore: 60 },
    { candidateId: "a", raterId: "r2", totalScore: 60 },
    { candidateId: "b", raterId: "r1", totalScore: 75 },
    { candidateId: "b", raterId: "r2", totalScore: 75 },
    { candidateId: "c", raterId: "r1", totalScore: 90 },
    { candidateId: "c", raterId: "r2", totalScore: 90 },
  ]);
  assert.equal(summary.doubleRatedCandidates, 3);
  assert.equal(summary.commonRaters, 2);
  assert.equal(summary.absoluteAgreementIcc, 1);
  assert.equal(summary.meanAbsoluteDifference, 0);
  assert.equal(summary.withinFiveMarksRate, 1);
});
