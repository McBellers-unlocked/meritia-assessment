/**
 * Seed the HR-peers demo: a small published DB scenario ("People & Culture
 * Advisor — Q2 People Pulse", slug demo-people-advisor) plus a cohort of 7
 * submitted dummy candidates with varied AI-sandbox usage and integrity
 * signals, and 3 spare invited tokens for a live candidate-side walkthrough.
 *
 *   Candidate matrix: see scripts/demo-cohort/candidates.ts.
 *   Scenario content:  see scripts/demo-cohort/scenario.ts.
 *
 * Everything is namespaced under the demo slug + cohort title; teardown is
 * scoped so the script cannot touch any real scenario or cohort.
 *
 * Idempotent: the default run tears down any prior demo cohort/scenario and
 * recreates them (fresh timestamps = "yesterday"). Re-running mints NEW
 * candidate ids and tokens, so don't re-run mid-demo.
 *
 * Run (DATABASE_URL injected from .env.local — Prisma CLI ignores .env.local):
 *   npx tsx scripts/seed-demo-cohort.ts             # teardown + reseed
 *   npx tsx scripts/seed-demo-cohort.ts --teardown  # delete only
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, Prisma } from "@prisma/client";
import { generateToken, indexToAnonymousId } from "../src/lib/recruit/tokens";
import {
  SLUG,
  TITLE,
  ORGANISATION,
  POSITION_TITLE,
  TOTAL_MINUTES,
  TOKEN_PREFIX,
  COHORT_TITLE,
  CHAT_TRIGGER_SECONDS,
  CHAT_MAX_TURNS,
  TASK1_TITLE,
  TASK1_BRIEF,
  TASK1_DELIVERABLE_LABEL,
  TASK1_DELIVERABLE_PLACEHOLDER,
  TASK1_EXHIBIT_TITLE,
  KNOWLEDGE_SYSTEM_PROMPT,
  TASK2_TITLE,
  TASK2_BRIEF,
  CHAT_PERSONA_NAME,
  CHAT_PERSONA_ROLE,
  CHAT_OPENER,
  CHAT_PERSONA_PROMPT,
  CHAT_EXPECTED_OUTCOMES,
  type DemoCandidate,
  type Msg,
} from "./demo-cohort/scenario";
import { DEMO_CANDIDATES, SPARE_CANDIDATES } from "./demo-cohort/candidates";

const prisma = new PrismaClient();
const BASE_URL = "https://www.uniqassess.org";
const RESERVED = ["fam-p4", "aplo-p2", "cso-p3", "ipac-d1", "ipac-people-capability"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function at(start: Date, min: number): Date {
  return new Date(start.getTime() + Math.round(min * 60_000));
}

function wordCount(html: string): number {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z#0-9]+;/gi, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

function estTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

async function mintToken(): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const t = generateToken(TOKEN_PREFIX);
    const exists = await prisma.recruitmentCandidate.findUnique({ where: { token: t } });
    if (!exists) return t;
  }
  throw new Error("could not mint a unique token after 25 attempts");
}

/** Validate one candidate's authored content before touching the DB. */
function validateCandidate(c: DemoCandidate): void {
  function fail(msg: string): never {
    throw new Error(`[${c.name}] invalid authored data: ${msg}`);
  }
  const checkTrail = (trail: Msg[], label: string) => {
    for (let i = 0; i < trail.length; i++) {
      const m = trail[i];
      const expected = i % 2 === 0 ? "candidate" : "ai";
      if (m.actor !== expected) fail(`${label} message ${i} actor ${m.actor}, expected ${expected}`);
      if (i > 0 && m.atMin <= trail[i - 1].atMin) fail(`${label} message ${i} atMin not increasing`);
      if (m.atMin <= 0 || m.atMin >= c.durationMin) fail(`${label} message ${i} atMin outside session`);
    }
  };
  checkTrail(c.memoTrail, "memoTrail");
  checkTrail(c.chatTrail, "chatTrail");
  const chatCandidateMsgs = c.chatTrail.filter((m) => m.actor === "candidate").length;
  if (chatCandidateMsgs > CHAT_MAX_TURNS) fail(`chat has ${chatCandidateMsgs} candidate turns > maxTurns`);
  if (c.chatTrail.length > 0) {
    if (c.chatOpenedAtMin == null) fail("chatTrail present but chatOpenedAtMin is null");
    if (c.chatOpenedAtMin >= c.chatTrail[0].atMin) fail("chat_opened must precede the first chat message");
    if (c.chatTrail[0].atMin * 60 < CHAT_TRIGGER_SECONDS) fail("chat reply before the IM trigger fires");
  }
  if (c.chatOpenedAtMin != null && c.chatOpenedAtMin * 60 < CHAT_TRIGGER_SECONDS) {
    fail("chat_opened before the IM trigger fires");
  }
  if (c.sentAtMin != null && (c.sentAtMin <= 0 || c.sentAtMin >= c.durationMin)) fail("sentAtMin outside session");
  if (c.durationMin > TOTAL_MINUTES) fail(`durationMin ${c.durationMin} exceeds the ${TOTAL_MINUTES}-minute budget`);
  // Off-tab windows: ordered, non-overlapping, inside the session, and empty
  // of interactions/pastes (you can't type or paste while the tab is hidden).
  const windows = c.offTabs.map((o) => ({ from: o.atMin, to: o.atMin + o.offTabSec / 60 }));
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    if (w.to >= c.durationMin) fail(`off-tab window ${i} extends past submit`);
    if (i > 0 && w.from <= windows[i - 1].to) fail(`off-tab windows ${i - 1}/${i} overlap`);
  }
  const insideAWindow = (min: number) => windows.some((w) => min > w.from && min < w.to);
  for (const m of [...c.memoTrail, ...c.chatTrail]) {
    if (insideAWindow(m.atMin)) fail(`interaction at ${m.atMin}min falls inside a hidden window`);
  }
  for (const p of c.pastes) {
    if (insideAWindow(p.atMin)) fail(`paste at ${p.atMin}min falls inside a hidden window`);
    if (p.atMin <= 0 || p.atMin >= c.durationMin) fail("paste outside session");
  }
  if (c.marks && (c.marks.score < 0 || c.marks.score > 100)) fail("score out of range");
}

// ---------------------------------------------------------------------------
// Teardown (scoped to the demo slug + cohort title)
// ---------------------------------------------------------------------------

async function teardown(): Promise<void> {
  if (RESERVED.includes(SLUG)) throw new Error(`refusing to touch reserved slug "${SLUG}"`);

  // Assessments first: scenario delete would SetNull customScenarioId and
  // strand the cohort. Assessment delete cascades candidates -> responses /
  // interactions / activity events.
  const cohorts = await prisma.recruitmentAssessment.findMany({
    where: { scenarioSlug: SLUG, title: COHORT_TITLE },
    select: { id: true, _count: { select: { candidates: true } } },
  });
  for (const a of cohorts) {
    await prisma.recruitmentAssessment.delete({ where: { id: a.id } });
    console.log(`deleted demo cohort ${a.id} (${a._count.candidates} candidates, cascaded)`);
  }

  const scenario = await prisma.recruitmentScenario.findUnique({ where: { slug: SLUG } });
  if (scenario) {
    await prisma.recruitmentScenario.delete({ where: { id: scenario.id } });
    console.log(`deleted demo scenario ${scenario.id} (slug ${SLUG}, cascaded tasks/exhibits/scripts)`);
  }
  if (cohorts.length === 0 && !scenario) console.log("nothing to tear down");
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  DEMO_CANDIDATES.forEach(validateCandidate);

  const now = new Date();
  const base = new Date(now);
  base.setUTCDate(base.getUTCDate() - 1);
  base.setUTCHours(9, 0, 0, 0); // yesterday 09:00 UTC

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (admin) console.log(`marker/creator: ADMIN user ${admin.email}`);
  else console.warn("no ADMIN user found — createdById/markedById will be null");

  // ---- scenario -----------------------------------------------------------
  const rubricJson = JSON.parse(
    readFileSync(join("infra", "recruit", "demo-people-advisor", "marking_rubric.json"), "utf-8")
  ) as { task1: { categories: unknown } };
  const exhibitHtml = readFileSync(
    join("infra", "recruit", "demo-people-advisor", "task1_exhibit.html"),
    "utf-8"
  );

  const scenario = await prisma.recruitmentScenario.create({
    data: {
      slug: SLUG,
      title: TITLE,
      organisation: ORGANISATION,
      positionTitle: POSITION_TITLE,
      defaultTotalMinutes: TOTAL_MINUTES,
      status: "published",
      publishedAt: now,
      createdById: admin?.id ?? null,
    },
  });
  const exhibit = await prisma.recruitmentScenarioExhibit.create({
    data: { scenarioId: scenario.id, title: TASK1_EXHIBIT_TITLE, html: exhibitHtml },
  });
  await prisma.recruitmentScenarioTask.create({
    data: {
      scenarioId: scenario.id,
      number: 1,
      kind: "memo_ai",
      title: TASK1_TITLE,
      briefMarkdown: TASK1_BRIEF,
      totalMarks: 100,
      systemPrompt: KNOWLEDGE_SYSTEM_PROMPT,
      exhibitId: exhibit.id,
      deliverableLabel: TASK1_DELIVERABLE_LABEL,
      deliverablePlaceholder: TASK1_DELIVERABLE_PLACEHOLDER,
      rubric: rubricJson.task1.categories as object,
    },
  });
  const chatTask = await prisma.recruitmentScenarioTask.create({
    data: {
      scenarioId: scenario.id,
      number: 2,
      kind: "chat",
      title: TASK2_TITLE,
      briefMarkdown: TASK2_BRIEF,
      totalMarks: 0,
    },
  });
  const chatScript = await prisma.recruitmentScenarioChatScript.create({
    data: {
      scenarioId: scenario.id,
      taskId: chatTask.id,
      triggerOffsetSeconds: CHAT_TRIGGER_SECONDS,
      personaName: CHAT_PERSONA_NAME,
      personaRole: CHAT_PERSONA_ROLE,
      openerMessage: CHAT_OPENER,
      systemPrompt: CHAT_PERSONA_PROMPT,
      maxTurns: CHAT_MAX_TURNS,
      expectedOutcomes: CHAT_EXPECTED_OUTCOMES,
    },
  });
  console.log(`created scenario ${scenario.id} (${SLUG}) — published, 2 tasks`);

  // ---- cohort -------------------------------------------------------------
  const assessment = await prisma.recruitmentAssessment.create({
    data: {
      title: COHORT_TITLE,
      scenarioSlug: SLUG,
      scenarioId: SLUG, // mirrored for back-compat; customScenarioId wins
      customScenarioId: scenario.id,
      totalMinutes: TOTAL_MINUTES,
      openDate: new Date(base.getTime() - 24 * 3_600_000),
      closeDate: new Date(now.getTime() + 14 * 24 * 3_600_000),
      createdById: admin?.id ?? null,
    },
  });
  console.log(`created cohort ${assessment.id} — "${COHORT_TITLE}"`);

  // ---- candidates ---------------------------------------------------------
  const threadKeyChat = `chat-${chatScript.id}`;
  const crib: string[] = [];
  let markIndex = 0;

  for (let i = 0; i < DEMO_CANDIDATES.length; i++) {
    const c = DEMO_CANDIDATES[i];
    const startedAt = at(base, c.startOffsetMin);
    const submittedAt = at(startedAt, c.durationMin);
    const deadline = at(startedAt, TOTAL_MINUTES);
    const token = await mintToken();
    const anon = indexToAnonymousId(i);

    const candidate = await prisma.recruitmentCandidate.create({
      data: {
        assessmentId: assessment.id,
        name: c.name,
        email: c.email,
        token,
        anonymousId: anon,
        status: "submitted",
        startedAt,
        submittedAt,
        deadline,
      },
    });

    // Interactions — merge both threads, sort chronologically, insert
    // SEQUENTIALLY (sequenceNum is a global serial; the reviewer orders by it).
    const merged = [
      ...c.memoTrail.map((m) => ({ ...m, taskNumber: 1, threadKey: "task-1" })),
      ...c.chatTrail.map((m) => ({ ...m, taskNumber: 2, threadKey: threadKeyChat })),
    ].sort((a, b) => a.atMin - b.atMin);
    for (const m of merged) {
      await prisma.recruitmentInteraction.create({
        data: {
          candidateId: candidate.id,
          taskNumber: m.taskNumber,
          timestamp: at(startedAt, m.atMin),
          actor: m.actor,
          content: m.content,
          tokenCount: m.actor === "ai" ? estTokens(m.content) : null,
          metadata: { threadKey: m.threadKey, seeded: true },
        },
      });
    }

    // Activity events (order irrelevant — the reviewer sorts by occurredAt).
    const events: Prisma.RecruitmentActivityEventCreateManyInput[] = [];
    for (const o of c.offTabs) {
      events.push({
        candidateId: candidate.id,
        occurredAt: at(startedAt, o.atMin),
        eventType: "visibility_hidden",
        taskNumber: null,
      });
      events.push({
        candidateId: candidate.id,
        occurredAt: at(startedAt, o.atMin + o.offTabSec / 60),
        eventType: "visibility_visible",
        taskNumber: null,
        metadata: { hiddenMs: o.offTabSec * 1000 },
      });
    }
    for (const p of c.pastes) {
      events.push({
        candidateId: candidate.id,
        occurredAt: at(startedAt, p.atMin),
        eventType: "paste",
        taskNumber: p.taskNumber,
        metadata: { target: p.target, charCount: p.charCount },
      });
    }
    if (c.chatOpenedAtMin != null) {
      events.push({
        candidateId: candidate.id,
        occurredAt: at(startedAt, c.chatOpenedAtMin),
        eventType: "chat_opened",
        taskNumber: chatTask.number,
        metadata: { scriptId: chatScript.id },
      });
    }
    if (events.length > 0) {
      await prisma.recruitmentActivityEvent.createMany({ data: events });
    }

    // Memo response (+ pre-marks for the marked subset).
    const marked = c.marks != null;
    const markedAt = marked ? at(base, 9 * 60 + markIndex * 10) : null; // yesterday evening
    if (marked) markIndex++;
    await prisma.recruitmentResponse.create({
      data: {
        candidateId: candidate.id,
        taskNumber: 1,
        content: c.memoHtml,
        wordCount: wordCount(c.memoHtml),
        sentAt: c.sentAtMin != null ? at(startedAt, c.sentAtMin) : null,
        ...(marked
          ? {
              score: c.marks!.score,
              comments: c.marks!.comments,
              issuesIdentified: c.marks!.issueIds,
              markedAt,
              markedById: admin?.id ?? null,
            }
          : {}),
      },
    });
    if (marked) {
      await prisma.recruitmentCandidate.update({
        where: { id: candidate.id },
        data: { totalScore: c.marks!.score },
      });
    }

    const aiMsgs = merged.filter((m) => m.actor === "candidate").length;
    crib.push(
      `${anon.padEnd(12)} ${c.name.padEnd(16)} ${String(c.durationMin + "m").padEnd(5)} ` +
        `${String(marked ? c.marks!.score : "—").padEnd(4)} msgs:${String(merged.length).padEnd(3)} ${c.story}`
    );
    console.log(
      `  + ${anon} — ${c.name} (${token}): ${merged.length} interactions, ${events.length} events, ` +
        `${marked ? `score ${c.marks!.score}` : "UNMARKED"}`
    );
    void aiMsgs;
  }

  // Spare invited tokens for the live walkthrough.
  const spareLines: string[] = [];
  for (let s = 0; s < SPARE_CANDIDATES.length; s++) {
    const sp = SPARE_CANDIDATES[s];
    const token = await mintToken();
    await prisma.recruitmentCandidate.create({
      data: {
        assessmentId: assessment.id,
        name: sp.name,
        email: sp.email,
        token,
        anonymousId: indexToAnonymousId(DEMO_CANDIDATES.length + s),
        status: "invited",
      },
    });
    spareLines.push(`  ${sp.name.padEnd(16)} ${BASE_URL}/assess/${SLUG}?token=${token}`);
  }

  // ---- post-seed verification --------------------------------------------
  console.log("\nverification:");
  let ok = true;
  const seeded = await prisma.recruitmentCandidate.findMany({
    where: { assessmentId: assessment.id, status: "submitted" },
    select: {
      anonymousId: true,
      startedAt: true,
      submittedAt: true,
      interactions: { orderBy: { sequenceNum: "asc" }, select: { timestamp: true } },
      activityEvents: { select: { eventType: true } },
      responses: { select: { wordCount: true } },
    },
    orderBy: { anonymousId: "asc" },
  });
  for (const s of seeded) {
    const problems: string[] = [];
    for (let i = 1; i < s.interactions.length; i++) {
      if (s.interactions[i].timestamp < s.interactions[i - 1].timestamp) {
        problems.push("interaction timestamps not monotone in sequenceNum");
        break;
      }
    }
    for (const iRow of s.interactions) {
      if (iRow.timestamp < s.startedAt! || iRow.timestamp > s.submittedAt!) {
        problems.push("interaction outside session window");
        break;
      }
    }
    const hid = s.activityEvents.filter((e) => e.eventType === "visibility_hidden").length;
    const vis = s.activityEvents.filter((e) => e.eventType === "visibility_visible").length;
    if (hid !== vis) problems.push(`hidden/visible mismatch (${hid}/${vis})`);
    if (!s.responses.length || !s.responses[0].wordCount) problems.push("memo missing or wordCount 0");
    if (problems.length) {
      ok = false;
      console.log(`  FAIL ${s.anonymousId}: ${problems.join("; ")}`);
    } else {
      console.log(`  pass ${s.anonymousId} (${s.interactions.length} interactions, ${s.activityEvents.length} events)`);
    }
  }
  if (!ok) throw new Error("post-seed verification failed — see above");

  // ---- summary ------------------------------------------------------------
  console.log(`
============================================================
DEMO COHORT READY
============================================================
Cohort:    ${BASE_URL}/admin/recruitment/${assessment.id}
Marking:   ${BASE_URL}/admin/recruitment/${assessment.id}/mark
Results:   ${BASE_URL}/admin/recruitment/${assessment.id}/results
Builder:   ${BASE_URL}/admin/recruitment/scenarios/${scenario.id}

CRIB SHEET (marking is blind — this maps anon IDs to the stories):
${crib.join("\n")}

Unmarked on purpose (live-mark in the demo): Candidate C (decent case),
Candidate F (the bad-integrity centrepiece).

SPARE INVITES for the live candidate walkthrough (single-use — starting
one burns it; rehearse on at most one and keep the rest fresh):
${spareLines.join("\n")}

Do NOT press "Reveal candidates" unless you want names shown permanently.
Teardown after the demo: npx tsx scripts/seed-demo-cohort.ts --teardown
============================================================`);
}

// ---------------------------------------------------------------------------

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set (expected in .env.local)");
    process.exit(1);
  }
  try {
    console.log(`target DB host: ${new URL(dbUrl).hostname}`);
  } catch {
    console.log("target DB host: (unparseable DATABASE_URL)");
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    console.error(`
Could not connect to the database: ${(e as Error).message}

.env.local may be stale after a password rotation. The live DATABASE_URL
lives in the Amplify app env — recover it with:

  aws amplify get-app --app-id d1wxabrgr6nkub --region eu-west-1 \\
    --query "app.environmentVariables.DATABASE_URL" --output text

  # if blank, it may be branch-level:
  aws amplify get-branch --app-id d1wxabrgr6nkub --branch-name main --region eu-west-1 \\
    --query "branch.environmentVariables.DATABASE_URL" --output text

then update DATABASE_URL in .env.local and re-run.`);
    process.exit(1);
  }

  if (process.argv.includes("--teardown")) {
    await teardown();
    return;
  }
  await teardown();
  await seed();
}

main()
  .catch((e) => {
    console.error("SEED ERROR:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
