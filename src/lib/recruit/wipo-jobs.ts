/**
 * WIPO open-jobs integration.
 *
 * Two upstreams:
 *   1. Supabase Edge Function (`wipo-jobs-api`) — gives us a clean list
 *      of currently open WIPO postings with metadata (title, grade,
 *      level, professional field, dates, and the canonical Taleo URL).
 *      The function also exposes a per-job detail endpoint, but its
 *      `description` field is patchy/empty for most jobs as of
 *      2026-05-07.
 *   2. WIPO Taleo (`wipo.taleo.net/.../jobdetail.ftl`) — the source of
 *      truth for full JD text. The job-search page is a JS SPA (no
 *      useful HTML), but the per-job detail page is server-rendered
 *      ~180KB of HTML containing a URL-encoded HTML description block.
 *
 * `fetchWipoJobDetail` calls (1) for metadata + the Taleo URL, then (2)
 * to scrape the full description. The result is shaped to drop straight
 * into the existing Generate-from-JD pipeline (`jdText` field).
 */

const SUPABASE_BASE =
  "https://sjtdudezqssbmratdgmy.supabase.co/functions/v1/wipo-jobs-api";

// Taleo upstream times out occasionally; keep this generous but bounded.
const TALEO_TIMEOUT_MS = 15_000;
const SUPABASE_TIMEOUT_MS = 10_000;

// Cache list/detail server-side for 5 minutes — postings change slowly
// and this also throttles Taleo from getting hammered if multiple HR
// users hit the picker concurrently.
const CACHE_REVALIDATE_SECONDS = 300;

const USER_AGENT =
  "UNIQAssess-WipoIntegration/1.0 (+https://www.uniqassess.org; contact: mattvalente85@gmail.com)";

export interface WipoJobListItem {
  id: string;
  externalId: string;
  title: string;
  organization: string;
  location: string | null;
  gradeCode: string | null;
  level: string | null;
  professionalField: string | null;
  postedDate: string | null;
  closingDate: string | null;
  link: string | null;
  summaryExcerpt: string | null;
}

export interface WipoJobListResult {
  items: WipoJobListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface WipoJobDetail extends WipoJobListItem {
  /** Full plain-text description scraped from the Taleo detail page. Empty if unavailable. */
  description: string;
  /** Raw description from the Supabase API (usually short/null). Kept for debugging. */
  supabaseDescription: string | null;
  /** True if `description` came from the Taleo scrape (richer); false if we fell back to supabaseDescription. */
  scrapedFromTaleo: boolean;
}

export interface WipoListFilters {
  q?: string;
  grade?: string;
  level?: string;
  limit?: number;
  offset?: number;
}

interface SupabaseListResponse {
  items?: SupabaseRawJob[];
  total?: number;
  limit?: number;
  offset?: number;
}

interface SupabaseRawJob {
  id?: string;
  external_id?: string;
  title?: string;
  organization?: string;
  location?: string | null;
  grade_code?: string | null;
  level?: string | null;
  professional_field?: string | null;
  posted_date?: string | null;
  closing_date?: string | null;
  link?: string | null;
  summary_excerpt?: string | null;
  description?: string | null;
  summary_html?: string | null;
}

export async function listWipoJobs(
  filters: WipoListFilters = {}
): Promise<WipoJobListResult> {
  const url = new URL(SUPABASE_BASE);
  if (filters.q) url.searchParams.set("q", filters.q);
  if (filters.grade) url.searchParams.set("grade", filters.grade);
  if (filters.level) url.searchParams.set("level", filters.level);
  url.searchParams.set("limit", String(filters.limit ?? 50));
  url.searchParams.set("offset", String(filters.offset ?? 0));

  const raw = await fetchJson<SupabaseListResponse>(url.toString());
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    items: items
      .map(normalizeJob)
      // Filter out Supabase placeholder rows ("No Jobs Found" etc.) so
      // they don't pollute the picker.
      .filter((j) => j.title && !/^no jobs? found$/i.test(j.title)),
    total: typeof raw.total === "number" ? raw.total : items.length,
    limit: typeof raw.limit === "number" ? raw.limit : items.length,
    offset: typeof raw.offset === "number" ? raw.offset : 0,
  };
}

export async function fetchWipoJobDetail(
  externalId: string
): Promise<WipoJobDetail> {
  const url = `${SUPABASE_BASE}/${encodeURIComponent(externalId)}`;
  const raw = await fetchJson<SupabaseRawJob>(url);
  if (!raw || !raw.external_id) {
    throw new WipoUpstreamError(`Job not found: ${externalId}`, 404);
  }

  const meta = normalizeJob(raw);
  const supabaseDescription =
    typeof raw.description === "string" && raw.description.trim()
      ? raw.description.trim()
      : null;

  // Try Taleo scrape if we have a link. Fall back to supabaseDescription
  // (or empty) on any failure — the caller decides whether the result is
  // usable.
  let scrapedDescription = "";
  if (meta.link) {
    try {
      scrapedDescription = await scrapeTaleoDescription(meta.link);
    } catch {
      scrapedDescription = "";
    }
  }

  const finalDescription =
    scrapedDescription.length > (supabaseDescription?.length ?? 0)
      ? scrapedDescription
      : supabaseDescription ?? "";

  return {
    ...meta,
    description: finalDescription,
    supabaseDescription,
    scrapedFromTaleo: scrapedDescription.length > 0,
  };
}

/**
 * Fetch the WIPO Taleo job detail page and extract the JD as plain text.
 *
 * Taleo embeds the description as a URL-encoded HTML block delimited by
 * `!*!` (start) and `!|!` (next field separator). The encoding includes
 * Word/Office artifacts (`MsoNormal`, escaped `\:` colons, etc.) that
 * we strip after URL-decoding.
 */
export async function scrapeTaleoDescription(taleoUrl: string): Promise<string> {
  // Force HTTPS — some links from Supabase come back as http://.
  const safeUrl = taleoUrl.replace(/^http:\/\//i, "https://");
  const html = await fetchText(safeUrl, {
    headers: { "User-Agent": USER_AGENT },
  });
  return parseTaleoDescriptionHtml(html);
}

export function parseTaleoDescriptionHtml(pageHtml: string): string {
  const startMarker = "!*!";
  const endMarker = "!|!";
  const startIdx = pageHtml.indexOf(startMarker);
  if (startIdx === -1) return "";
  const afterStart = pageHtml.slice(startIdx + startMarker.length);
  const endIdx = afterStart.indexOf(endMarker);
  if (endIdx === -1) return "";
  const encoded = afterStart.slice(0, endIdx);

  let decoded: string;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    // If the block has invalid percent escapes, fall back to a more
    // forgiving decoder that ignores malformed sequences.
    decoded = encoded.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  }

  // Replace block-level tags with line breaks before stripping all
  // tags, so we keep paragraph structure that the criteria extractor
  // benefits from. Case-insensitive.
  decoded = decoded.replace(/<\/?(p|br|div|li|h[1-6])\b[^>]*>/gi, "\n");

  // Strip remaining tags.
  let text = decoded.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities the criteria extractor will choke on.
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

  // Taleo escapes `:` and similar punctuation as `\:` inside attribute
  // values; some leak into text content (e.g. "deadline\: please note").
  text = text.replace(/\\([:;,.])/g, "$1");

  // Normalize whitespace: collapse runs of spaces, dedupe blank lines,
  // trim each line.
  text = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l, i, arr) => l.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

function normalizeJob(raw: SupabaseRawJob): WipoJobListItem {
  return {
    id: String(raw.id ?? ""),
    externalId: String(raw.external_id ?? ""),
    title: String(raw.title ?? "").trim(),
    organization: String(raw.organization ?? "WIPO"),
    location: raw.location ?? null,
    gradeCode: raw.grade_code ?? null,
    level: raw.level ?? null,
    professionalField: raw.professional_field ?? null,
    postedDate: raw.posted_date ?? null,
    closingDate: raw.closing_date ?? null,
    link: raw.link ?? null,
    summaryExcerpt: raw.summary_excerpt ?? null,
  };
}

export class WipoUpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "WipoUpstreamError";
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      next: { revalidate: CACHE_REVALIDATE_SECONDS },
    });
    if (!res.ok) {
      throw new WipoUpstreamError(
        `WIPO API ${res.status} for ${url}`,
        res.status
      );
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof WipoUpstreamError) throw e;
    if ((e as Error).name === "AbortError") {
      throw new WipoUpstreamError(`WIPO API timed out for ${url}`, 504);
    }
    throw new WipoUpstreamError(
      `WIPO API request failed: ${(e as Error).message}`,
      502
    );
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(
  url: string,
  init: RequestInit & { headers?: Record<string, string> }
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TALEO_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      next: { revalidate: CACHE_REVALIDATE_SECONDS },
    });
    if (!res.ok) {
      throw new WipoUpstreamError(
        `Taleo ${res.status} for ${url}`,
        res.status
      );
    }
    return await res.text();
  } catch (e) {
    if (e instanceof WipoUpstreamError) throw e;
    if ((e as Error).name === "AbortError") {
      throw new WipoUpstreamError(`Taleo timed out for ${url}`, 504);
    }
    throw new WipoUpstreamError(
      `Taleo request failed: ${(e as Error).message}`,
      502
    );
  } finally {
    clearTimeout(timer);
  }
}
