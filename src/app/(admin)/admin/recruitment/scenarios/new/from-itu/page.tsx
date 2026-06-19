"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface JobRow {
  externalId: string;
  title: string;
  location: string | null;
  department: string | null;
  postedDate: string | null;
  link: string;
}

interface JobDetail extends JobRow {
  description: string;
}

interface ListResponse {
  items: JobRow[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 50;
// Same key as the WIPO picker — the from-jd page consumes whichever
// arrived. Either picker, never both at once.
const HANDOFF_STORAGE_KEY = "wipo-jd-handoff";

export default function FromItuPickerPage() {
  const { status } = useSession();
  const router = useRouter();

  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");

  const [items, setItems] = useState<JobRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, JobDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailErrorById, setDetailErrorById] = useState<
    Record<string, string>
  >({});
  const [handingOffId, setHandingOffId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    void loadPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const loadPage = async (nextOffset: number, replace: boolean) => {
    setLoading(true);
    setListError(null);
    try {
      const url = new URL(
        "/api/admin/recruitment/itu-jobs",
        window.location.origin
      );
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String(nextOffset));
      if (q) url.searchParams.set("q", q);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const body = (await res.json()) as ListResponse | { error?: string };
      if (!res.ok) {
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
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
        `/api/admin/recruitment/itu-jobs/${encodeURIComponent(job.externalId)}`,
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
      organisation: "ITU",
      filename: `ITU posting · ${detail.externalId}`,
      sourceLink: detail.link,
    };
    try {
      sessionStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
    } catch {
      // Quota / private mode — fall through to navigate; the from-jd
      // page will start at upload if storage isn't available.
    }
    router.push("/admin/recruitment/scenarios/new/from-jd?source=itu");
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
        Build assessment from an ITU open posting
      </h1>
      <p className="text-sm text-uq-2 mt-1 mb-6">
        Pick a currently open role from the{" "}
        <a
          href="https://jobs.itu.int/go/View-all-categories/8942455/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-uq-accent hover:text-uq-accent-hover hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md"
        >
          ITU careers board
        </a>
        . We&apos;ll pull in the full job description so you can tick the
        criteria you want to test — Claude then generates the assessment
        tasks.
      </p>

      <FilterBar
        qInput={qInput}
        setQInput={setQInput}
        onApplySearch={onApplySearch}
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
          "Loading ITU open postings…"
        ) : total !== null ? (
          <>
            Showing <span className="font-mono tabular-nums text-uq-2">{items.length}</span> of{" "}
            <span className="font-mono tabular-nums text-uq-2">{total}</span> open positions
            {q && " (filtered)"}
          </>
        ) : null}
      </div>

      <div className="space-y-3">
        {items.map((job) => {
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
  onRefresh,
  loading,
}: {
  qInput: string;
  setQInput: (v: string) => void;
  onApplySearch: () => void;
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
          placeholder="Search by title or keyword (e.g. engineer, security)"
          className="flex-1 min-w-[220px] rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
        />
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
          title="Re-fetch from ITU"
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
  const meta = [job.department, job.location, job.postedDate]
    .filter(Boolean)
    .join(" · ");

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
          </span>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-uq-faint px-4 py-4 bg-uq-glass-subtle">
          {detailLoading && (
            <div className="text-sm text-uq-2 inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-uq-accent animate-uq-pulse-glow" />
              Fetching full description from ITU…
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
        <span className="font-mono tabular-nums">
          {description.length.toLocaleString()}
        </span>{" "}
        characters · scraped from ITU careers board
      </div>

      {empty ? (
        <div className="rounded-md px-3 py-2 text-xs border border-[color:var(--uq-warn-line)] bg-[color:var(--uq-warn-soft)] text-[color:var(--uq-warn-text)]">
          The description couldn&apos;t be fetched. Try the link to view the
          posting on ITU directly, or pick another role.
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
            href={detail.link}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-lg border border-uq-strong bg-uq-glass-subtle text-uq text-sm font-medium transition-colors hover:border-uq-accent hover:bg-uq-accent-soft hover:text-uq focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
          >
            ↗ View on ITU Careers
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
