import { NextRequest, NextResponse } from "next/server";

import { requireScenarioBuilder } from "@/lib/admin-auth";
import { listItuJobs, ItuUpstreamError } from "@/lib/recruit/itu-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/admin/recruitment/itu-jobs?q=&limit=&offset=
 *   → { items, total, limit, offset }
 *
 * Auth-gated proxy to ITU's SAP SuccessFactors careers board. Pulls
 * every upstream page (the dataset is small — ~30 jobs) and slices
 * locally by the caller's offset/limit. 5-min server cache.
 */
export async function GET(request: NextRequest) {
  const auth = await requireScenarioBuilder();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const limit = clampInt(searchParams.get("limit"), 50, 1, 200);
  const offset = clampInt(searchParams.get("offset"), 0, 0, 1000);
  const q = searchParams.get("q")?.trim() || undefined;

  try {
    const result = await listItuJobs({ q, limit, offset });
    return NextResponse.json(result);
  } catch (e) {
    const status = e instanceof ItuUpstreamError ? e.status : 502;
    return NextResponse.json(
      { error: (e as Error).message || "ITU upstream error" },
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
