/**
 * One-off: port the code-based IPAC scenario (src/lib/recruit/ipac-d1-2026.ts)
 * into an editable, published DB scenario so its IM (and everything else) is
 * configurable in the admin scenario builder.
 *
 * Shape: two memo_ai tasks (with exhibits + the Knowledge System prompt + the
 * per-task marking rubric) and one chat task (the Staff-Council persona IM).
 * The 5-email in-tray is intentionally NOT ported. Memo briefs get a **Sent:**
 * line so the candidate UI renders them like real email.
 *
 * Idempotent: re-running deletes the existing scenario (by slug) first.
 *
 * Run (DATABASE_URL injected from .env.local — Prisma CLI ignores .env.local):
 *   DATABASE_URL="$(node -e "require('dotenv').config({path:'.env.local'});process.stdout.write(process.env.DATABASE_URL)")" npx tsx scripts/port-ipac-to-db.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { IPAC_D1_2026 } from "../src/lib/recruit/ipac-d1-2026";

const prisma = new PrismaClient();
const SLUG = "ipac-people-capability";
const CHAT_TRIGGER_SECONDS = 300; // 5 min default; editable in the builder

// Insert a "Sent:" header line after the Subject line of an email-style brief.
function withSent(brief: string, sent: string): string {
  return brief.replace(/(\*\*\s*Subject\s*:\*\*[^\n]*)/i, `$1\n**Sent:** ${sent}`);
}

const SENT_TIMES: Record<number, string> = {
  1: "Mon 23 Jun 2026, 08:14",
  2: "Mon 23 Jun 2026, 09:02",
};

async function main() {
  const cfg = IPAC_D1_2026;
  const rubric = JSON.parse(
    readFileSync(join("infra", "recruit", "ipac-d1-2026", "marking_rubric.json"), "utf-8")
  ) as { task1: { categories: unknown }; task2: { categories: unknown } };
  const rubricByTask: Record<number, unknown> = { 1: rubric.task1.categories, 2: rubric.task2.categories };

  // Idempotent: drop any prior port.
  const existing = await prisma.recruitmentScenario.findUnique({ where: { slug: SLUG } });
  if (existing) {
    await prisma.recruitmentScenario.delete({ where: { id: existing.id } });
    console.log(`deleted existing scenario ${existing.id} (slug ${SLUG})`);
  }

  const scenario = await prisma.recruitmentScenario.create({
    data: {
      slug: SLUG,
      title: cfg.title,
      organisation: cfg.organisation,
      positionTitle: cfg.positionTitle,
      defaultTotalMinutes: cfg.defaultTotalMinutes,
      status: "published",
      publishedAt: new Date(),
    },
  });
  console.log(`created scenario ${scenario.id} (${SLUG}) — published`);

  // Memo tasks (1, 2) with their exhibit + rubric.
  for (const t of cfg.tasks) {
    if (t.kind !== "memo_ai") continue;
    const exhibit = await prisma.recruitmentScenarioExhibit.create({
      data: { scenarioId: scenario.id, title: t.exhibitTitle, html: t.exhibitHtml },
    });
    await prisma.recruitmentScenarioTask.create({
      data: {
        scenarioId: scenario.id,
        number: t.number,
        kind: "memo_ai",
        title: t.title,
        briefMarkdown: withSent(t.briefMarkdown, SENT_TIMES[t.number] ?? ""),
        totalMarks: t.totalMarks,
        systemPrompt: t.systemPrompt,
        exhibitId: exhibit.id,
        deliverableLabel: t.deliverableLabel,
        deliverablePlaceholder: t.deliverablePlaceholder,
        rubric: (rubricByTask[t.number] ?? null) as object,
      },
    });
    console.log(`  + memo task ${t.number} "${t.title}" (exhibit ${exhibit.id})`);
  }

  // Chat IM — renumbered to task 3 (the in-tray task is dropped).
  const chat = cfg.tasks.find((t) => t.kind === "chat");
  if (chat && chat.kind === "chat") {
    const chatTask = await prisma.recruitmentScenarioTask.create({
      data: {
        scenarioId: scenario.id,
        number: 3,
        kind: "chat",
        title: chat.title,
        briefMarkdown: chat.briefMarkdown,
        totalMarks: chat.totalMarks,
      },
    });
    await prisma.recruitmentScenarioChatScript.create({
      data: {
        scenarioId: scenario.id,
        taskId: chatTask.id,
        triggerOffsetSeconds: CHAT_TRIGGER_SECONDS,
        personaName: chat.script.personaName,
        personaRole: chat.script.personaRole,
        openerMessage: chat.script.openerMessage,
        systemPrompt: chat.script.systemPrompt,
        maxTurns: chat.script.maxTurns,
        expectedOutcomes: chat.script.expectedOutcomes,
      },
    });
    console.log(`  + chat task 3 "${chat.title}" — IM @${CHAT_TRIGGER_SECONDS}s, persona "${chat.script.personaName}"`);
  }

  // Verify the round-trip.
  const check = await prisma.recruitmentScenario.findUnique({
    where: { id: scenario.id },
    include: { tasks: { orderBy: { number: "asc" } }, exhibits: true, chatScripts: true },
  });
  console.log(
    `\nDONE — scenario ${scenario.id} | tasks: ${check?.tasks.map((t) => `${t.number}:${t.kind}`).join(", ")} | exhibits: ${check?.exhibits.length} | chatScripts: ${check?.chatScripts.length} | status: ${check?.status}`
  );
}

main()
  .catch((e) => { console.error("PORT ERROR:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
