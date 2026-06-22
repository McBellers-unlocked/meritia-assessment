/**
 * Surgically update the live editable IPAC scenario's memo briefs from the
 * code config (src/lib/recruit/ipac-d1-2026.ts), WITHOUT recreating the
 * scenario — so any builder edits (e.g. the IM trigger/persona) are preserved.
 *
 * The briefs use {{name}} tokens; they are substituted per-candidate
 * server-side in /api/assess/state (personaliseBrief). RUN THIS ONLY ONCE THE
 * STATE-ROUTE SUBSTITUTION IS DEPLOYED, or a candidate on the old build would
 * see a literal {{name}}.
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
    include: { tasks: true },
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
  console.log("DONE — memo briefs synced; IM/persona and other fields untouched.");
}

main()
  .catch((e) => { console.error("SYNC ERROR:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
