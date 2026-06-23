/**
 * Surgically update the live editable IPAC scenario's CODE-authored content
 * from src/lib/recruit/ipac-d1-2026.ts (+ the marking rubric JSON) — the two
 * memo briefs, their deliverable label/placeholder, the per-task marking
 * rubric, and the chat persona's system prompt — WITHOUT recreating the
 * scenario, so builder edits to structural fields (IM trigger time, opener,
 * persona name, max turns) are preserved.
 *
 * The briefs use {{name}} tokens, substituted per-candidate server-side in
 * /api/assess/state (personaliseBrief); only run the brief sync once that
 * substitution is deployed, or an old build would show a literal {{name}}.
 * The persona prompt, deliverable text and rubric have no tokens and are safe
 * to sync any time. NOTE: this OVERWRITES the DB task rubric for the two memo
 * tasks from the JSON — author the rubric in marking_rubric.json, not the
 * builder, or builder rubric edits will be lost on the next sync.
 *
 *   DATABASE_URL="$(node -e "require('dotenv').config({path:'.env.local'});process.stdout.write(process.env.DATABASE_URL)")" npx tsx scripts/sync-ipac-briefs.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { IPAC_D1_2026 } from "../src/lib/recruit/ipac-d1-2026";

const prisma = new PrismaClient();
const SLUG = "ipac-people-capability";

async function main() {
  const scenario = await prisma.recruitmentScenario.findUnique({
    where: { slug: SLUG },
    include: { tasks: true, chatScripts: true },
  });
  if (!scenario) throw new Error(`scenario ${SLUG} not found — run port-ipac-to-db.ts first`);

  // The per-task marking rubric lives in a separate JSON (loaded for code
  // scenarios by loadRubric). The DB stores just the `categories` map on each
  // task's `rubric` column, keyed by task number — so map task1/task2 -> 1/2.
  const rubricJson = JSON.parse(
    readFileSync(join(process.cwd(), "infra", "recruit", "ipac-d1-2026", "marking_rubric.json"), "utf-8"),
  ) as { task1: { categories: Record<string, unknown> }; task2: { categories: Record<string, unknown> } };
  const categoriesByTaskNumber: Record<number, Record<string, unknown>> = {
    1: rubricJson.task1.categories,
    2: rubricJson.task2.categories,
  };

  for (const t of IPAC_D1_2026.tasks) {
    if (t.kind !== "memo_ai") continue;
    const dbTask = scenario.tasks.find((x) => x.number === t.number && x.kind === "memo_ai");
    if (!dbTask) { console.log(`  ! no DB memo task ${t.number} to update`); continue; }
    const categories = categoriesByTaskNumber[t.number] ?? {};
    await prisma.recruitmentScenarioTask.update({
      where: { id: dbTask.id },
      data: {
        briefMarkdown: t.briefMarkdown,
        deliverableLabel: t.deliverableLabel,
        deliverablePlaceholder: t.deliverablePlaceholder,
        rubric: categories as unknown as object,
      },
    });
    console.log(
      `  updated task ${t.number}: brief (${t.briefMarkdown.length} chars), deliverable label/placeholder, rubric (${Object.keys(categories).length} categories)`,
    );
  }

  // Chat persona system prompt only — leave trigger/opener/personaName/maxTurns
  // (the builder-tunable fields) exactly as they are in the DB.
  const codeChat = IPAC_D1_2026.tasks.find((t) => t.kind === "chat");
  if (codeChat && codeChat.kind === "chat") {
    for (const cs of scenario.chatScripts) {
      await prisma.recruitmentScenarioChatScript.update({
        where: { id: cs.id },
        data: { systemPrompt: codeChat.script.systemPrompt },
      });
      console.log(`  updated chat persona prompt for ${cs.personaName} (${codeChat.script.systemPrompt.length} chars)`);
    }
  }
  console.log("DONE — briefs + persona prompt synced; IM trigger/opener/maxTurns untouched.");
}

main()
  .catch((e) => { console.error("SYNC ERROR:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
