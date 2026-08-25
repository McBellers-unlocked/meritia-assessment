/**
 * Read-only sanity check for the seeded demo cohort. Recomputes exactly what
 * the reviewer UI derives at render time (integrity tiles, message counts,
 * rubric normalisation, AI branding) so the demo can be checked from the
 * terminal without opening the admin UI.
 *
 * Run: npx tsx scripts/demo-cohort/verify.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { SLUG, COHORT_TITLE } from "./scenario";

const prisma = new PrismaClient();

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

  const candidates = await prisma.recruitmentCandidate.findMany({
    where: { assessmentId: assessment.id },
    orderBy: { anonymousId: "asc" },
    include: {
      responses: true,
      interactions: { orderBy: { sequenceNum: "asc" } },
      activityEvents: { orderBy: { occurredAt: "asc" } },
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
  }

  console.log(`\nspares (invited, excluded from marking list): ${invited.map((c) => `${c.anonymousId} ${c.token}`).join(", ")}`);

  // Ranking as the results page orders it
  const ranked = submitted
    .filter((c) => c.totalScore != null)
    .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))
    .map((c) => `${c.anonymousId} ${c.totalScore}`);
  console.log(`ranking: ${ranked.join("  |  ")}  (+${submitted.filter((c) => c.totalScore == null).length} unmarked)`);
}

main()
  .catch((e) => {
    console.error("VERIFY ERROR:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
