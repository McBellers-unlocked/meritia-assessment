/**
 * Auth helpers for admin-gated route handlers.
 *
 * Two gates:
 *   - requireAdmin()         — full operator accounts only (Cognito ADMIN).
 *                              Blocks DEMO sessions. Use for candidates,
 *                              results, cohorts, anything cross-tenant.
 *   - requireScenarioBuilder() — ADMIN or DEMO. Use for the scenario
 *                              builder surface (WIPO picker, from-jd,
 *                              scenarios CRUD). Always pair with a
 *                              per-resource ownership check via
 *                              assertScenarioAccess() / scopeWhere().
 *
 * Each helper returns either `{ ok: true, session, role }` or
 * `{ ok: false, response }` so the caller can `return response`.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  FULL_ADMIN_ROLES,
  SCENARIO_BUILDER_ROLES,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export type AdminSession = Awaited<ReturnType<typeof getServerSession<typeof authOptions>>>;

export type AuthResult =
  | {
      ok: true;
      session: NonNullable<AdminSession>;
      role: "ADMIN" | "DEMO";
      userId: string;
    }
  | { ok: false; response: NextResponse };

async function authenticate(
  allowedRoles: readonly string[]
): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const role = (session.user as { role?: string }).role;
  if (!role || !allowedRoles.includes(role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return {
    ok: true,
    session,
    role: role as "ADMIN" | "DEMO",
    userId: session.user.id as string,
  };
}

/** Full operator (ADMIN). Blocks DEMO sessions. */
export async function requireAdmin(): Promise<AuthResult> {
  return authenticate(FULL_ADMIN_ROLES as readonly string[]);
}

/** ADMIN or DEMO. Use on scenario-builder routes. */
export async function requireScenarioBuilder(): Promise<AuthResult> {
  return authenticate(SCENARIO_BUILDER_ROLES as readonly string[]);
}

/**
 * Per-resource ownership check for the scenario builder surface.
 *
 * - ADMIN sees every scenario.
 * - DEMO can only see/edit scenarios they themselves created
 *   (`createdById === userId`).
 *
 * Returns null on allow, a 403/404 NextResponse on deny.
 */
export async function assertScenarioAccess(
  auth: Extract<AuthResult, { ok: true }>,
  scenarioId: string
): Promise<NextResponse | null> {
  if (auth.role === "ADMIN") return null;
  const scenario = await prisma.recruitmentScenario.findUnique({
    where: { id: scenarioId },
    select: { id: true, createdById: true },
  });
  if (!scenario) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (scenario.createdById !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * Prisma `where` fragment that scopes a scenarios query to what the
 * caller is allowed to see. ADMIN gets `{}` (no constraint); DEMO gets
 * `{ createdById: theirUserId }`. Compose with the caller's other
 * filters via `{ ...scopeWhere, status: 'published' }`.
 */
export function scenarioScopeWhere(
  auth: Extract<AuthResult, { ok: true }>
): { createdById?: string } {
  if (auth.role === "ADMIN") return {};
  return { createdById: auth.userId };
}

/**
 * Per-resource ownership check for assessments (cohorts).
 * Mirror of assertScenarioAccess but for RecruitmentAssessment.
 * DEMO users can only see/edit assessments they themselves created.
 */
export async function assertAssessmentAccess(
  auth: Extract<AuthResult, { ok: true }>,
  assessmentId: string
): Promise<NextResponse | null> {
  if (auth.role === "ADMIN") return null;
  const assessment = await prisma.recruitmentAssessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, createdById: true },
  });
  if (!assessment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (assessment.createdById !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * Prisma `where` fragment scoping an assessments query. Same shape as
 * scenarioScopeWhere — empty for ADMIN, createdById-bound for DEMO.
 */
export function assessmentScopeWhere(
  auth: Extract<AuthResult, { ok: true }>
): { createdById?: string } {
  if (auth.role === "ADMIN") return {};
  return { createdById: auth.userId };
}
