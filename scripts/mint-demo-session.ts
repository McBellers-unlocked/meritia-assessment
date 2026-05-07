/**
 * Mint a tokenized demo session for a prospect.
 *
 * Usage:
 *   npx tsx scripts/mint-demo-session.ts --name "WIPO Director" [--email her@example.com] [--days 7]
 *
 * Creates:
 *   - a DEMO-role User (with the supplied email or a synthetic one)
 *   - a RecruitmentDemoSession row carrying the token + expiry
 *
 * Prints the activation URL (one URL per session — share over email/Slack).
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
      `  npx tsx scripts/mint-demo-session.ts --name "WIPO Director" [--email her@example.com] [--days 7]\n` +
      `  npx tsx scripts/mint-demo-session.ts --revoke <token-or-session-id>\n`
  );
  process.exit(2);
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

    const baseUrl =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
      "https://www.uniqassess.org";
    const url = `${baseUrl}/api/demo/activate?t=${token}`;

    console.log("✓ Demo session created");
    console.log(`  name:       ${session.name}`);
    console.log(`  email:      ${email}`);
    console.log(`  sessionId:  ${session.id}`);
    console.log(`  expires:    ${session.expiresAt.toISOString()}`);
    console.log(`  days valid: ${days}`);
    console.log("");
    console.log("Send this URL to the prospect:");
    console.log("");
    console.log(`  ${url}`);
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
