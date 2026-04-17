/**
 * Prisma client entry point.
 *
 * Direct connection to Postgres via `DATABASE_URL`. The Callater original
 * carried a Lambda-proxy transport for Amplify SSR (which can't reach a
 * VPC-only RDS directly); it was dropped during the Meritia carve-out to
 * keep the dependency surface smaller. Re-introduce if Meritia ends up on
 * the same hosting stack.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
