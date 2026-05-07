import { NextRequest, NextResponse } from "next/server";

import { requireScenarioBuilder } from "@/lib/admin-auth";
import {
  fetchWipoJobDetail,
  WipoUpstreamError,
} from "@/lib/recruit/wipo-jobs";

export const dynamic = "force-dynamic";
// Taleo scrape is normally <2s; the 15s timeout in the lib bounds the
// upstream wait. 30s here gives plenty of margin under Amplify's cap.
export const maxDuration = 30;

/**
 * GET /api/admin/recruitment/wipo-jobs/<external_id>
 *   → WipoJobDetail (metadata + scraped JD plain text)
 *
 * Calls the Supabase API for metadata + the canonical Taleo URL, then
 * scrapes Taleo for the full description. Falls back to the (usually
 * shorter) Supabase description if the scrape fails or returns less.
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

  try {
    const detail = await fetchWipoJobDetail(id);
    return NextResponse.json(detail);
  } catch (e) {
    const status = e instanceof WipoUpstreamError ? e.status : 502;
    return NextResponse.json(
      { error: (e as Error).message || "WIPO upstream error" },
      { status }
    );
  }
}
