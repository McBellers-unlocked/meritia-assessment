import { NextRequest, NextResponse } from "next/server";

import { requireScenarioBuilder } from "@/lib/admin-auth";
import {
  fetchItuJobDetail,
  ItuUpstreamError,
} from "@/lib/recruit/itu-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/admin/recruitment/itu-jobs/<jobId>
 *   → ItuJobDetail (metadata + scraped JD plain text)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireScenarioBuilder();
  if (!auth.ok) return auth.response;

  const id = params.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (!/^\d+$/.test(id)) {
    return NextResponse.json(
      { error: "id must be numeric (ITU job IDs are numeric)" },
      { status: 400 }
    );
  }

  try {
    const detail = await fetchItuJobDetail(id);
    return NextResponse.json(detail);
  } catch (e) {
    const status = e instanceof ItuUpstreamError ? e.status : 502;
    return NextResponse.json(
      { error: (e as Error).message || "ITU upstream error" },
      { status }
    );
  }
}
