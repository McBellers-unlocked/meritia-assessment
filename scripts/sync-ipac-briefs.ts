/**
 * Surgically update the live editable IPAC scenario's CODE-authored content
 * from src/lib/recruit/ipac-d1-2026.ts — the two memo briefs and the chat
 * persona's system prompt — WITHOUT recreating the scenario, so builder edits
 * to structural fields (IM trigger time, opener, persona name, max turns) are
 * preserved.
 *
 * The briefs use {{name}} tokens, substituted per-candidate server-side in
 * /api/assess/state (personaliseBrief); only run the brief sync once that
 * substitution is deployed, or an old build would show a literal {{name}}.
 * The persona prompt has no tokens and is safe to sync any time.
 *
 *   DATABASE_URL="$(node -e "require('dotenv').config({path:'.env.local'});process.stdout.write(process.env.DATABASE_URL)")" npx tsx scripts/sync-ipac-briefs.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
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

  for (const t of IPAC_D1_2026.tasks) {
    if (t.kind !== "memo_ai") continue;
    const dbTask = scenario.tasks.find((x) => x.number === t.number && x.kind === "memo_ai");
    if (!dbTask) { console.log(`  ! no DB memo task ${t.number} to update`); continue; }
    await prisma.recruitmentScenarioTask.update({
      where: { id: dbTask.id },
      data: { briefMarkdown: t.briefMarkdown },
    });
    console.log(`  updated brief for task ${t.number} (${t.briefMarkdown.length} chars)`);
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
