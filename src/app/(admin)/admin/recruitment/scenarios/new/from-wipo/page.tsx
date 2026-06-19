"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface JobRow {
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

interface JobDetail extends JobRow {
  description: string;
  scrapedFromTaleo: boolean;
}

interface ListResponse {
  items: JobRow[];
  total: number;
  limit: number;
  offset: number;
}

const GRADE_OPTIONS = ["", "P1", "P2", "P3", "P4", "P5", "P6"];
const LEVEL_OPTIONS = ["", "Junior", "Mid", "Senior"];
const PAGE_SIZE = 50;

// Key under which we hand off the picked job to the from-jd flow.
const HANDOFF_STORAGE_KEY = "wipo-jd-handoff";

export default function FromWipoPickerPage() {
  const { status } = useSession();
  const router = useRouter();

  // Filters — only `q`/grade/level are sent upstream.
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [grade, setGrade] = useState("");
  const [level, setLevel] = useState("");

  const [items, setItems] = useState<JobRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Detail panel state — keyed by externalId.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, JobDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailErrorById, setDetailErrorById] = useState<
    Record<string, string>
  >({});

  // Hand-off state — disables clicks while we navigate away.
  const [handingOffId, setHandingOffId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Fetch first page (and refetch when filters change).
  useEffect(() => {
    void loadPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, grade, level]);

  const loadPage = async (nextOffset: number, replace: boolean) => {
    setLoading(true);
    setListError(null);
    try {
      const url = new URL(
        "/api/admin/recruitment/wipo-jobs",
        window.location.origin
      );
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String(nextOffset));
      if (q) url.searchParams.set("q", q);
      if (grade) url.searchParams.set("grade", grade);
      if (level) url.searchParams.set("level", level);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const body = (await res.json()) as ListResponse | { error?: string };
      if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      const list = body as ListResponse;
      if (replace) {
        setItems(list.items);
        setExpandedId(null);
      } else {
        setItems((prev) => [...prev, ...list.items]);
      }
      setTotal(list.total);
      setOffset(nextOffset + list.items.length);
    } catch (e) {
      setListError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const sortedItems = useMemo(() => {
    // Sort jobs closing soonest first; jobs with no closing date go to
    // the end. Stable for ties.
    return items.slice().sort((a, b) => {
      const aDate = a.closingDate ? Date.parse(a.closingDate) : Number.POSITIVE_INFINITY;
      const bDate = b.closingDate ? Date.parse(b.closingDate) : Number.POSITIVE_INFINITY;
      if (aDate !== bDate) return aDate - bDate;
      return a.title.localeCompare(b.title);
    });
  }, [items]);

  const onApplySearch = () => {
    setQ(qInput.trim());
    setOffset(0);
  };

  const toggleExpand = async (job: JobRow) => {
    if (expandedId === job.externalId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(job.externalId);
    if (detailById[job.externalId] || detailErrorById[job.externalId]) return;
    setDetailLoadingId(job.externalId);
    try {
      const res = await fetch(
        `/api/admin/recruitment/wipo-jobs/${encodeURIComponent(
          job.externalId
        )}`,
        { cache: "no-store" }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setDetailById((prev) => ({ ...prev, [job.externalId]: body }));
    } catch (e) {
      setDetailErrorById((prev) => ({
        ...prev,
        [job.externalId]: (e as Error).message,
      }));
    } finally {
      setDetailLoadingId(null);
    }
  };

  const buildAssessment = (detail: JobDetail) => {
    if (!detail.description.trim()) return;
    setHandingOffId(detail.externalId);
    const handoff = {
      jdText: detail.description,
      title: detail.title,
      positionTitle: detail.title,
      organisation: detail.organization || "WIPO",
      filename: `WIPO posting · ${detail.externalId}`,
      sourceLink: detail.link,
    };
    try {
      sessionStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
    } catch {
      // Quota or private-mode error — fall back to nothing; the from-jd
      // page will start at the upload step. Still navigate so the user
      // sees a visible result instead of a stuck button.
    }
    router.push("/admin/recruitment/scenarios/new/from-jd?source=wipo");
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 animate-uq-rise">
      <div className="text-xs">
        <Link
          href="/admin/recruitment/scenarios"
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-uq-accent hover:text-uq-accent-hover hover:underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md"
        >
          ← Scenarios
        </Link>
      </div>

      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-uq mt-2">
        Build assessment from a WIPO open posting
      </h1>
      <p className="text-sm text-uq-2 mt-1 mb-6">
        Pick a currently open role from the{" "}
        <a
          href="https://wipo.taleo.net/careersection/wp_2_pd/jobsearch.ftl?lang=en&portal=50305027338"
          target="_blank"
          rel="noopener noreferrer"
          className="text-uq-accent hover:text-uq-accent-hover hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md"
        >
          WIPO careers board
        </a>
        . We&apos;ll pull in the full job description so you can tick the
        criteria you want to test — Claude then generates the assessment
        tasks.
      </p>

      <FilterBar
        qInput={qInput}
        setQInput={setQInput}
        onApplySearch={onApplySearch}
        grade={grade}
        setGrade={(v) => {
          setGrade(v);
          setOffset(0);
        }}
        level={level}
        setLevel={(v) => {
          setLevel(v);
          setOffset(0);
        }}
        onRefresh={() => void loadPage(0, true)}
        loading={loading}
      />

      {listError && (
        <div className="rounded-md px-3 py-2 text-sm mb-4 border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">
          {listError}
        </div>
      )}

      <div className="text-xs text-uq-3 mb-3">
        {loading && items.length === 0 ? (
          "Loading WIPO open postings…"
        ) : total !== null ? (
          <>
            Showing <span className="font-mono tabular-nums text-uq-2">{items.length}</span> of{" "}
            <span className="font-mono tabular-nums text-uq-2">{total}</span> open positions
            {(q || grade || level) && " (filtered)"}
          </>
        ) : null}
      </div>

      <div className="space-y-3">
        {sortedItems.map((job) => {
          const expanded = expandedId === job.externalId;
          const detail = detailById[job.externalId];
          const detailError = detailErrorById[job.externalId];
          const detailLoading = detailLoadingId === job.externalId;
          return (
            <JobCard
              key={job.externalId}
              job={job}
              expanded={expanded}
              detail={detail}
              detailLoading={detailLoading}
              detailError={detailError}
              handingOff={handingOffId === job.externalId}
              onToggle={() => void toggleExpand(job)}
              onBuild={() => detail && buildAssessment(detail)}
            />
          );
        })}
        {!loading && items.length === 0 && !listError && (
          <div className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass p-8 text-center text-sm text-uq-3">
            No matching open postings.
          </div>
        )}
      </div>

      {total !== null && items.length < total && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => void loadPage(offset, false)}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-uq-strong bg-uq-glass-subtle text-uq text-sm font-medium transition-colors hover:border-uq-accent hover:bg-uq-accent-soft hover:text-uq disabled:opacity-40 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

function FilterBar({
  qInput,
  setQInput,
  onApplySearch,
  grade,
  setGrade,
  level,
  setLevel,
  onRefresh,
  loading,
}: {
  qInput: string;
  setQInput: (v: string) => void;
  onApplySearch: () => void;
  grade: string;
  setGrade: (v: string) => void;
  level: string;
  setLevel: (v: string) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <section className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass p-3 mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onApplySearch();
            }
          }}
          placeholder="Search by title or keyword (e.g. officer, security)"
          className="flex-1 min-w-[220px] rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
        />
        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className="rounded-md border border-uq bg-uq-glass-subtle px-2 py-2 text-sm text-uq transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1 [&>option]:bg-uq-elev2 [&>option]:text-uq"
          aria-label="Grade filter"
        >
          {GRADE_OPTIONS.map((g) => (
            <option key={g || "any-grade"} value={g}>
              {g ? `Grade ${g}` : "Any grade"}
            </option>
          ))}
        </select>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="rounded-md border border-uq bg-uq-glass-subtle px-2 py-2 text-sm text-uq transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1 [&>option]:bg-uq-elev2 [&>option]:text-uq"
          aria-label="Level filter"
        >
          {LEVEL_OPTIONS.map((l) => (
            <option key={l || "any-level"} value={l}>
              {l || "Any level"}
            </option>
          ))}
        </select>
        <button
          onClick={onApplySearch}
          className="px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
        >
          Search
        </button>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-2 rounded-md border border-uq text-uq-2 text-sm font-medium transition-colors hover:border-uq-strong hover:bg-uq-elev2 hover:text-uq disabled:opacity-40 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
          title="Re-fetch from WIPO"
        >
          {loading ? "…" : "↻"}
        </button>
      </div>
    </section>
  );
}

function JobCard({
  job,
  expanded,
  detail,
  detailLoading,
  detailError,
  handingOff,
  onToggle,
  onBuild,
}: {
  job: JobRow;
  expanded: boolean;
  detail?: JobDetail;
  detailLoading: boolean;
  detailError?: string;
  handingOff: boolean;
  onToggle: () => void;
  onBuild: () => void;
}) {
  const meta = [
    job.gradeCode,
    job.level,
    job.location,
    job.professionalField,
  ]
    .filter(Boolean)
    .join(" · ");
  const closingLabel = formatClosing(job.closingDate);

  return (
    <article className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 text-left hover:bg-uq-elev2 flex items-start gap-3 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
      >
        <span
          className={`mt-1 text-uq-3 transition-transform inline-block ${
            expanded ? "rotate-90" : ""
          }`}
          aria-hidden
        >
          ▶
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-uq">
            {job.title}
          </span>
          <span className="block text-xs text-uq-3 mt-0.5">
            {meta || "—"}
            {closingLabel && (
              <span className="ml-2 text-uq-2">{closingLabel}</span>
            )}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-uq-faint px-4 py-4 bg-uq-glass-subtle">
          {detailLoading && (
            <div className="text-sm text-uq-2 inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-uq-accent animate-uq-pulse-glow" />
              Fetching full description from WIPO…
            </div>
          )}
          {detailError && !detailLoading && (
            <div className="rounded-md px-3 py-2 text-sm border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">
              {detailError}
            </div>
          )}
          {detail && !detailLoading && (
            <DetailBody
              detail={detail}
              handingOff={handingOff}
              onBuild={onBuild}
            />
          )}
        </div>
      )}
    </article>
  );
}

function DetailBody({
  detail,
  handingOff,
  onBuild,
}: {
  detail: JobDetail;
  handingOff: boolean;
  onBuild: () => void;
}) {
  const description = detail.description;
  const empty = !description.trim();
  const tooShort = !empty && description.length < 600;

  return (
    <div className="space-y-3">
      <div className="text-xs text-uq-2">
        <span className="font-mono tabular-nums">{description.length.toLocaleString()}</span>{" "}
        characters
        {detail.scrapedFromTaleo
          ? " · scraped from WIPO Taleo"
          : " · WIPO Supabase API"}
        {detail.closingDate && (
          <span className="ml-2">· closes {detail.closingDate}</span>
        )}
      </div>

      {empty ? (
        <div className="rounded-md px-3 py-2 text-xs border border-[color:var(--uq-warn-line)] bg-[color:var(--uq-warn-soft)] text-[color:var(--uq-warn-text)]">
          The description couldn&apos;t be fetched. Try the link to view the
          posting on WIPO directly, or pick another role.
        </div>
      ) : (
        <details>
          <summary className="cursor-pointer text-xs text-uq-accent hover:text-uq-accent-hover hover:underline">
            Description preview
          </summary>
          <pre className="mt-2 max-h-72 overflow-y-auto bg-uq-elev1 border border-uq-faint rounded p-3 text-xs whitespace-pre-wrap font-mono text-uq-2">
            {description.slice(0, 4000)}
            {description.length > 4000 && "\n\n…[truncated for preview]"}
          </pre>
        </details>
      )}

      {tooShort && (
        <div className="rounded-md px-3 py-2 text-xs border border-[color:var(--uq-warn-line)] bg-[color:var(--uq-warn-soft)] text-[color:var(--uq-warn-text)]">
          Description is short — criteria extraction may produce thin results.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {detail.link && (
          <a
            href={detail.link.replace(/^http:\/\//i, "https://")}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-lg border border-uq-strong bg-uq-glass-subtle text-uq text-sm font-medium transition-colors hover:border-uq-accent hover:bg-uq-accent-soft hover:text-uq focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
          >
            ↗ View on WIPO Careers
          </a>
        )}
        <button
          onClick={onBuild}
          disabled={empty || handingOff}
          className="px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
        >
          {handingOff ? "Opening…" : "✨ Build assessment from this job"}
        </button>
      </div>
    </div>
  );
}

function formatClosing(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return `Closes ${iso}`;
  const d = new Date(ms);
  const today = new Date();
  const days = Math.round(
    (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days < 0) return `Closed ${iso}`;
  if (days === 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  if (days <= 14) return `Closes in ${days} days`;
  return `Closes ${iso}`;
}
