/**
 * ITU open-jobs integration.
 *
 * ITU's careers board (jobs.itu.int) is an SAP SuccessFactors site;
 * unlike WIPO's setup, both the list page and individual job-detail
 * pages are fully server-rendered HTML, so we don't need a Supabase
 * proxy or Browserless — plain HTTP fetch + regex parsing is enough.
 *
 *   List:    GET /go/View-all-categories/8942455/<offset>/?q=<term>
 *            → 25 rows per page, each as <tr class="data-row"> with
 *              jobTitle-link / jobLocation / jobDepartment / jobDate.
 *
 *   Detail:  GET /job/<slug>/<jobid>/
 *            → <div class="jobdescription">…</div> with the full ad
 *              (Word/Office-styled but clean).
 *
 * The total count is in a "Page X of Y, Results A to B of N" string.
 * As of 2026-05-07 the board has ~33 listings, almost all of which
 * have a closing date in the description body (no structured field).
 */

const ITU_BASE = "https://jobs.itu.int";
const ITU_LIST_PATH = "/go/View-all-categories/8942455/";
const PAGE_SIZE = 25; // SAP SF default; not configurable from the URL.

const ITU_TIMEOUT_MS = 15_000;
const CACHE_REVALIDATE_SECONDS = 300;

const USER_AGENT =
  "UNIQAssess-ItuIntegration/1.0 (+https://www.uniqassess.org; contact: mattvalente85@gmail.com)";

export interface ItuJobListItem {
  /** Numeric job ID extracted from the detail URL (e.g. "1327373955"). */
  externalId: string;
  title: string;
  location: string | null;
  department: string | null; // ITU calls this "Job family" (e.g. "SSA")
  postedDate: string | null; // free-form, e.g. "May 6, 2026"
  link: string; // absolute URL to the detail page
}

export interface ItuJobListResult {
  items: ItuJobListItem[];
  total: number;
  /** offset/limit reflect what the caller asked for (we slice locally). */
  limit: number;
  offset: number;
}

export interface ItuJobDetail extends ItuJobListItem {
  description: string;
}

export interface ItuListFilters {
  q?: string;
  limit?: number;
  offset?: number;
}

export class ItuUpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ItuUpstreamError";
  }
}

export async function listItuJobs(
  filters: ItuListFilters = {}
): Promise<ItuJobListResult> {
  // ITU paginates via path segment: /<categoryId>/<offset>/. We fetch
  // every page (small dataset, ~33 rows) and slice locally so the
  // caller's offset/limit are honoured even when the upstream page
  // boundary doesn't align.
  const requestedOffset = filters.offset ?? 0;
  const requestedLimit = filters.limit ?? 50;
  const q = filters.q?.trim() ?? "";

  // First page tells us the total — pull more pages only if needed.
  const firstPage = await fetchItuListPage(0, q);
  const aggregated: ItuJobListItem[] = firstPage.items.slice();
  if (firstPage.total > PAGE_SIZE) {
    const pages = Math.ceil(firstPage.total / PAGE_SIZE);
    for (let p = 1; p < pages; p++) {
      const page = await fetchItuListPage(p * PAGE_SIZE, q);
      aggregated.push(...page.items);
    }
  }

  return {
    items: aggregated.slice(requestedOffset, requestedOffset + requestedLimit),
    total: aggregated.length,
    limit: requestedLimit,
    offset: requestedOffset,
  };
}

export async function fetchItuJobDetail(
  externalId: string
): Promise<ItuJobDetail> {
  // We don't have the slug standalone — but ITU's detail URL accepts
  // any slug as long as the trailing numeric ID is correct. Use a
  // benign placeholder; the server redirects to the canonical URL.
  const url = `${ITU_BASE}/job/_/${encodeURIComponent(externalId)}/`;
  const html = await fetchHtml(url);

  // Extract metadata from the page chrome (title in <meta og:title>,
  // canonical URL gives us the slug). Fall back to title-tag scrape.
  const title =
    matchFirst(html, /<meta\s+property="og:title"\s+content="([^"]+)"/i) ??
    matchFirst(html, /<title>([^<|]+?)\s*(?:Job Details\s*\|\s*ITU)?<\/title>/i) ??
    `ITU job ${externalId}`;
  const canonical = matchFirst(html, /<link\s+rel="canonical"\s+href="([^"]+)"/i);
  const link = canonical ?? `${ITU_BASE}/job/_/${externalId}/`;

  const description = parseItuDescriptionHtml(html);

  // We don't have structured location/department on the detail page —
  // they're inside the description as labeled paragraphs. Surface what
  // we can extract; UI falls back gracefully on null.
  const location = matchFirst(
    description,
    /Duty station:\s*([^\n]+?)(?:\s{2,}|$)/i
  );
  const department = matchFirst(
    description,
    /(?:Sector|Department):\s*([^\n]+?)(?:\s{2,}|$)/i
  );

  return {
    externalId,
    title: decodeEntities(title).trim(),
    location: location ?? null,
    department: department ?? null,
    postedDate: null,
    link,
    description,
  };
}

/**
 * Pull one upstream list page and turn it into structured rows.
 * Exported (with the description-parser below) so the API route can
 * unit-test the parsers in isolation.
 */
export async function fetchItuListPage(
  startRow: number,
  q: string
): Promise<{ items: ItuJobListItem[]; total: number }> {
  // ITU's path uses startRow (0-based, multiples of 25). We also keep
  // the sortColumn so pagination is stable; q is the query string.
  const path = startRow === 0 ? ITU_LIST_PATH : `${ITU_LIST_PATH}${startRow}/`;
  const url = new URL(path, ITU_BASE);
  url.searchParams.set("q", q);
  url.searchParams.set("sortColumn", "referencedate");
  url.searchParams.set("sortDirection", "desc");

  const html = await fetchHtml(url.toString());
  return parseItuListHtml(html);
}

export function parseItuListHtml(pageHtml: string): {
  items: ItuJobListItem[];
  total: number;
} {
  const totalMatch = pageHtml.match(
    /Page\s+\d+\s+of\s+\d+,\s+Results\s+\d+\s+to\s+\d+\s+of\s+(\d+)/i
  );
  const total = totalMatch ? Number(totalMatch[1]) : 0;

  const rowRe = /<tr class="data-row">([\s\S]*?)<\/tr>/gi;
  const items: ItuJobListItem[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(pageHtml)) !== null) {
    const rowHtml = m[1];
    const item = parseItuListRow(rowHtml);
    if (item) items.push(item);
  }
  return { items, total };
}

function parseItuListRow(rowHtml: string): ItuJobListItem | null {
  // Title + link are in an <a class="jobTitle-link" href="/job/.../<id>/">Title</a>
  const linkMatch = rowHtml.match(
    /<a[^>]+class="jobTitle-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
  );
  if (!linkMatch) return null;
  const href = linkMatch[1];
  const title = decodeEntities(stripTags(linkMatch[2])).trim();

  const idMatch = href.match(/\/(\d+)\/?(?:[?#]|$)/);
  if (!idMatch) return null;
  const externalId = idMatch[1];

  const location = pickSpan(rowHtml, "jobLocation");
  const department = pickSpan(rowHtml, "jobDepartment");
  const postedDate = pickSpan(rowHtml, "jobDate");

  return {
    externalId,
    title,
    location,
    department,
    postedDate,
    link: href.startsWith("http") ? href : `${ITU_BASE}${href}`,
  };
}

/**
 * Extract the plain-text job description from a detail page.
 *
 * The content lives in `<span class="jobdescription">…</span>` (yes,
 * a span — SAP SuccessFactors does that), nested inside a wrapper
 * div with `data-careersite-propertyid="description"`. We tolerate
 * either tag and balance opens/closes since the body contains lots
 * of nested formatting markup.
 */
export function parseItuDescriptionHtml(pageHtml: string): string {
  const openRe =
    /<(div|span)[^>]+class\s*=\s*["'][^"']*\bjobdescription\b[^"']*["'][^>]*>/i;
  const open = openRe.exec(pageHtml);
  if (!open) return "";
  const tag = open[1].toLowerCase();
  const startIdx = open.index + open[0].length;

  // Walk forward, balancing matching tag opens/closes. The
  // description contains many nested elements of the same type so a
  // naive search for </tag> truncates it.
  let depth = 1;
  let i = startIdx;
  const tagRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  tagRe.lastIndex = startIdx;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(pageHtml)) !== null) {
    if (match[0].startsWith("</")) {
      depth--;
      if (depth === 0) {
        i = match.index;
        break;
      }
    } else {
      depth++;
    }
  }
  if (depth !== 0) {
    // Fallback: take everything to the end of <body>.
    i = pageHtml.length;
  }
  const block = pageHtml.slice(startIdx, i);

  // Convert block-level tags to line breaks, then strip the rest.
  let text = block
    .replace(/<\/?(p|br|div|li|h[1-6]|tr)\b[^>]*>/gi, "\n")
    .replace(/<\/td>/gi, " ");
  text = stripTags(text);
  text = decodeEntities(text);
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

/* ---------------- helpers ---------------- */

function pickSpan(html: string, className: string): string | null {
  const re = new RegExp(
    `<span[^>]+class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/span>`,
    "i"
  );
  const m = html.match(re);
  if (!m) return null;
  const text = decodeEntities(stripTags(m[1])).trim();
  return text || null;
}

function matchFirst(s: string, re: RegExp): string | null {
  const m = s.match(re);
  return m ? m[1] : null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ITU_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      next: { revalidate: CACHE_REVALIDATE_SECONDS },
    });
    if (!res.ok) {
      throw new ItuUpstreamError(`ITU ${res.status} for ${url}`, res.status);
    }
    return await res.text();
  } catch (e) {
    if (e instanceof ItuUpstreamError) throw e;
    if ((e as Error).name === "AbortError") {
      throw new ItuUpstreamError(`ITU timed out for ${url}`, 504);
    }
    throw new ItuUpstreamError(
      `ITU request failed: ${(e as Error).message}`,
      502
    );
  } finally {
    clearTimeout(timer);
  }
}
