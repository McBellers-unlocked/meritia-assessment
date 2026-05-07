/**
 * Mint a tokenized demo session for a prospect.
 *
 * Usage:
 *   npx tsx scripts/mint-demo-session.ts --name "<their name>" \
 *     [--email <them@example.com>] [--days 7] [--dest <path>] [--base-url <https://...>]
 *
 * --dest sets where the activation URL drops the prospect after sign-in
 *   (default: /admin/recruitment/scenarios/new/from-wipo).
 *   Example for an ITU prospect: --dest /admin/recruitment/scenarios/new/from-itu
 *
 * --base-url overrides the host the printed URL uses. Useful when
 *   .env.local has NEXTAUTH_URL=http://localhost:3000 — without this
 *   flag the script would print a localhost URL even though the
 *   token is valid against the prod DB.
 *   Default: https://www.uniqassess.org (or NEXTAUTH_URL if it's https).
 *
 * Revoke an active session:
 *   npx tsx scripts/mint-demo-session.ts --revoke <token-or-session-id>
 *
 * The scripts/ directory has no test infrastructure; this is a one-shot
 * operator tool, not application code.
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

interface ParsedArgs {
  name?: string;
  email?: string;
  days?: number;
  dest?: string;
  baseUrl?: string;
  revoke?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    switch (a) {
      case "--name":
        out.name = next;
        i++;
        break;
      case "--email":
        out.email = next;
        i++;
        break;
      case "--days":
        out.days = Number(next);
        i++;
        break;
      case "--dest":
        out.dest = next;
        i++;
        break;
      case "--base-url":
        out.baseUrl = next;
        i++;
        break;
      case "--revoke":
        out.revoke = next;
        i++;
        break;
    }
  }
  return out;
}

function usage(): never {
  process.stderr.write(
    `Usage:\n` +
      `  npx tsx scripts/mint-demo-session.ts --name "<their name>"\n` +
      `       [--email <them@example.com>] [--days 7] [--dest <path>] [--base-url <https://...>]\n` +
      `  npx tsx scripts/mint-demo-session.ts --revoke <token-or-session-id>\n`
  );
  process.exit(2);
}

function resolveBaseUrl(override: string | undefined): string {
  if (override) return override.replace(/\/$/, "");
  // Ignore NEXTAUTH_URL when it's a non-https value (common when
  // .env.local points to localhost) — printing a localhost URL the
  // operator would have to manually rewrite is worse than defaulting
  // to prod.
  const env = process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  if (env && env.startsWith("https://")) return env;
  return "https://www.uniqassess.org";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    if (args.revoke) {
      await revoke(prisma, args.revoke);
      return;
    }

    if (!args.name?.trim()) usage();
    const name = args.name.trim();
    const days = Number.isFinite(args.days) && (args.days as number) > 0
      ? Math.min(90, Math.trunc(args.days as number))
      : 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const token = randomBytes(32).toString("hex"); // 64 chars
    // Synthetic email if none provided. The User table has a unique
    // index on email, so make it unique-by-token to avoid collisions.
    const email =
      args.email?.trim() || `demo-${token.slice(0, 12)}@uniqassess.local`;

    // Two-step transaction so the User row exists before the
    // DemoSession references it.
    const session = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          role: "DEMO",
        },
      });
      return tx.recruitmentDemoSession.create({
        data: {
          token,
          name,
          email: args.email?.trim() || null,
          userId: user.id,
          expiresAt,
        },
      });
    });

    const baseUrl = resolveBaseUrl(args.baseUrl);
    const dest = args.dest?.trim();
    const url = new URL("/api/demo/activate", baseUrl);
    url.searchParams.set("t", token);
    if (dest) url.searchParams.set("dest", dest);

    console.log("✓ Demo session created");
    console.log(`  name:       ${session.name}`);
    console.log(`  email:      ${email}`);
    console.log(`  sessionId:  ${session.id}`);
    console.log(`  expires:    ${session.expiresAt.toISOString()}`);
    console.log(`  days valid: ${days}`);
    if (dest) console.log(`  lands at:   ${dest}`);
    console.log("");
    console.log("Send this URL to the prospect:");
    console.log("");
    console.log(`  ${url.toString()}`);
    console.log("");
    console.log(
      `To revoke later: npx tsx scripts/mint-demo-session.ts --revoke ${token}`
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function revoke(prisma: PrismaClient, ref: string): Promise<void> {
  const session = await prisma.recruitmentDemoSession.findFirst({
    where: { OR: [{ token: ref }, { id: ref }] },
  });
  if (!session) {
    process.stderr.write(`No session found for "${ref}"\n`);
    process.exit(1);
  }
  if (session.revokedAt) {
    console.log(
      `Session ${session.id} (${session.name}) was already revoked at ${session.revokedAt.toISOString()}.`
    );
    return;
  }
  await prisma.recruitmentDemoSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });
  console.log(`✓ Revoked session ${session.id} (${session.name}).`);
  console.log(
    `  The linked User (${session.userId}) is left in place; delete manually if needed.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
