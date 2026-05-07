import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { listWipoJobs, WipoUpstreamError } from "@/lib/recruit/wipo-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/admin/recruitment/wipo-jobs?q=&grade=&level=&limit=&offset=
 *   → { items, total, limit, offset }
 *
 * Auth-gated proxy to the WIPO jobs Supabase API. Filters out placeholder
 * "No Jobs Found" rows. Server-side cached for 5 minutes inside the lib.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const limit = clampInt(searchParams.get("limit"), 50, 1, 100);
  const offset = clampInt(searchParams.get("offset"), 0, 0, 1000);
  const q = searchParams.get("q")?.trim() || undefined;
  const grade = searchParams.get("grade")?.trim() || undefined;
  const level = searchParams.get("level")?.trim() || undefined;

  try {
    const result = await listWipoJobs({ q, grade, level, limit, offset });
    return NextResponse.json(result);
  } catch (e) {
    const status = e instanceof WipoUpstreamError ? e.status : 502;
    return NextResponse.json(
      { error: (e as Error).message || "WIPO upstream error" },
      { status }
    );
  }
}

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
