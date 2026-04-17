/**
 * Optional bootstrap seed. Not required — the NextAuth signIn callback creates
 * a User row with role=ADMIN on first Cognito sign-in. Run this only if you
 * want to pre-create an admin before any sign-in happens (e.g. for smoke
 * testing the admin UI without Cognito wired up).
 *
 * Usage: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const bootstrapEmail = process.env.SEED_ADMIN_EMAIL;
  if (!bootstrapEmail) {
    console.log(
      "[seed] SEED_ADMIN_EMAIL not set — skipping admin bootstrap. " +
        "Set it in .env.local to pre-create an admin row."
    );
    return;
  }
  const user = await prisma.user.upsert({
    where: { email: bootstrapEmail },
    update: { role: "ADMIN" },
    create: {
      email: bootstrapEmail,
      role: "ADMIN",
      name: bootstrapEmail.split("@")[0],
    },
  });
  console.log(`[seed] admin user ready: ${user.email} (${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
