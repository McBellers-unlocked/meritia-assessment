"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface RankRow {
  candidateId: string;
  anonymousId: string;
  name: string | null;
  email: string | null;
  status: string;
  submittedAt: string | null;
  timeTakenMin: number | null;
  totalScore: number | null;
  task1Score: number | null;
  task2Score: number | null;
  task1Words: number;
  task2Words: number;
  candidateMessageCount: number;
  task1IssuesIdentified: string[];
  task2IssuesIdentified: string[];
  fullyMarked: boolean;
}

interface ResultsData {
  assessment: { id: string; title: string; scenarioId: string; revealedAt: string | null; totalMinutes: number };
  revealed: boolean;
  ranking: RankRow[];
  analytics: {
    submittedCount: number;
    scoredCount: number;
    fullyMarkedCount: number;
    averageTotal: number | null;
    averageTask1: number | null;
    averageTask2: number | null;
    averageTimeMin: number | null;
    averageMessages: number | null;
    messageCountScoreCorrelation: number | null;
    histogram: { bucket: string; count: number }[];
    issueAnalytics: { id: string; title: string; maxMarks: number | null; identifiedCount: number; identifiedRate: number | null }[];
  };
}

export default function ResultsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = useSession();
  const [data, setData] = useState<ResultsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => { if (status === "unauthenticated") router.push("/login"); }, [status, router]);

  const reload = async () => {
    try {
      const res = await fetch(`/api/admin/recruitment/${params.id}/results`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => { void reload(); }, [params.id]);

  const reveal = async () => {
    setRevealing(true);
    try {
      const res = await fetch(`/api/admin/recruitment/${params.id}/reveal`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRevealing(false);
      setConfirmOpen(false);
    }
  };

  const top5Ids = useMemo(() => {
    if (!data) return new Set<string>();
    const scored = data.ranking.filter((r) => r.totalScore != null);
    return new Set(scored.slice(0, 5).map((r) => r.candidateId));
  }, [data]);

  if (error) return <Box error={error} />;
  if (!data) return <Box loading />;

  const revealed = data.revealed;
  const maxHist = Math.max(1, ...data.analytics.histogram.map((b) => b.count));

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 animate-uq-rise">
      <div className="text-xs">
        <Link href={`/admin/recruitment/${params.id}`} className="font-mono text-[11px] uppercase tracking-[0.14em] text-uq-accent hover:text-uq-accent-hover hover:underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md">← Dashboard</Link>
      </div>
      <div className="flex items-start justify-between mt-2 gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-uq">Results · {data.assessment.title}</h1>
          <div className="text-sm text-uq-3 mt-1">
            {revealed
              ? <span className="text-[color:var(--uq-success-text)] font-medium">Names revealed at {new Date(data.assessment.revealedAt!).toLocaleString()}</span>
              : <span className="text-[color:var(--uq-warn-text)] font-medium">Blind mode — names hidden until you reveal</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <a
            href={`/api/admin/recruitment/${params.id}/results.csv`}
            className="px-4 py-2 rounded-lg border border-uq bg-uq-glass-subtle text-uq-2 text-sm font-medium transition-colors hover:border-uq-strong hover:bg-uq-elev2 hover:text-uq focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
          >
            Download CSV
          </a>
          {!revealed && (
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={data.analytics.fullyMarkedCount === 0}
              className="px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium tracking-[-0.005em] shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
              title={data.analytics.fullyMarkedCount === 0 ? "Mark at least one candidate before revealing" : ""}
            >
              Reveal candidates
            </button>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-5 gap-3 mt-6">
        <KPI label="Submitted" value={data.analytics.submittedCount} />
        <KPI label="Fully marked" value={data.analytics.fullyMarkedCount} accent="green" />
        <KPI label="Avg total" value={data.analytics.averageTotal != null ? data.analytics.averageTotal.toFixed(1) : "—"} />
        <KPI label="Avg time (min)" value={data.analytics.averageTimeMin != null ? Math.round(data.analytics.averageTimeMin) : "—"} />
        <KPI label="Avg messages" value={data.analytics.averageMessages != null ? data.analytics.averageMessages.toFixed(1) : "—"} />
      </div>

      <section className="mt-8 rounded-xl border border-uq bg-uq-elev1 shadow-uq-glass p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold tracking-[-0.005em] text-uq">Score distribution</h2>
          <div className="text-xs text-uq-3">
            Avg Task 1: <span className="font-mono tabular-nums">{data.analytics.averageTask1?.toFixed(1) ?? "—"}</span> ·
            Avg Task 2: <span className="font-mono tabular-nums">{data.analytics.averageTask2?.toFixed(1) ?? "—"}</span> ·
            Messages↔Score r: <span className="font-mono tabular-nums">{data.analytics.messageCountScoreCorrelation?.toFixed(2) ?? "—"}</span>
          </div>
        </div>
        <div className="mt-4 flex items-end gap-1 h-32">
          {data.analytics.histogram.map((b) => (
            <div key={b.bucket} className="flex-1 flex flex-col items-center">
              <div className="text-[10px] text-uq-2 font-mono mb-1">{b.count || ""}</div>
              <div
                className="w-full bg-uq-accent rounded-t shadow-uq-glow-soft"
                style={{ height: `${(b.count / maxHist) * 100}%`, minHeight: b.count > 0 ? "2px" : "0" }}
              />
              <div className="font-mono text-[10px] text-uq-3 mt-1">{b.bucket}</div>
            </div>
          ))}
        </div>
      </section>

      {data.analytics.issueAnalytics.length > 0 && (
        <section className="mt-6 rounded-xl border border-uq bg-uq-elev1 shadow-uq-glass p-5">
          <h2 className="text-base font-semibold tracking-[-0.005em] text-uq">Embedded issue identification</h2>
          <p className="text-xs text-uq-3 mt-1 mb-3">
            % of fully-marked candidates ({data.analytics.fullyMarkedCount}) who identified each embedded issue.
          </p>
          <table className="w-full text-sm">
            <thead className="font-mono text-[11px] uppercase tracking-[0.14em] text-uq-3">
              <tr>
                <th className="text-left py-1">Issue</th>
                <th className="text-right py-1">Marks</th>
                <th className="text-right py-1">Found by</th>
                <th className="text-left py-1 pl-3 w-1/3">Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.analytics.issueAnalytics.map((iss) => {
                const rate = iss.identifiedRate ?? 0;
                return (
                  <tr key={iss.id} className="border-t border-uq-faint">
                    <td className="py-1.5 text-uq">{iss.title}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-uq-3">{iss.maxMarks ?? "—"}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-uq-2">{iss.identifiedCount}</td>
                    <td className="py-1.5 pl-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-uq-elev2 border border-uq-faint rounded-full h-2 overflow-hidden">
                          <div className="bg-uq-accent h-2 shadow-uq-glow-soft" style={{ width: `${rate * 100}%` }} />
                        </div>
                        <span className="text-xs font-mono tabular-nums text-uq-2 w-12 text-right">{(rate * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-6 rounded-xl border border-uq bg-uq-elev1 shadow-uq-glass overflow-hidden">
        <div className="px-5 py-3 border-b border-uq-faint bg-uq-elev2 text-sm font-semibold text-uq">
          Ranking
          {revealed && <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-uq-3">Top 5 highlighted</span>}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-uq-elev2 text-uq-3">
            <tr className="border-b border-uq-faint">
              <th className="px-3 py-2 text-left w-12 font-mono text-[11px] uppercase tracking-[0.14em]">Rank</th>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Anon ID</th>
              {revealed && <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Name</th>}
              {revealed && <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Email</th>}
              <th className="px-3 py-2 text-right font-mono text-[11px] uppercase tracking-[0.14em]">T1</th>
              <th className="px-3 py-2 text-right font-mono text-[11px] uppercase tracking-[0.14em]">T2</th>
              <th className="px-3 py-2 text-right font-mono text-[11px] uppercase tracking-[0.14em]">Total</th>
              <th className="px-3 py-2 text-right font-mono text-[11px] uppercase tracking-[0.14em]">Time</th>
              <th className="px-3 py-2 text-right font-mono text-[11px] uppercase tracking-[0.14em]">Msgs</th>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.ranking.map((r, i) => {
              const isTop = revealed && top5Ids.has(r.candidateId);
              return (
                <tr
                  key={r.candidateId}
                  className={[
                    "border-t border-uq-faint transition-colors",
                    isTop ? "bg-[color:var(--uq-accent-soft)] border-l-2 border-l-uq-accent" : "hover:bg-uq-elev2",
                  ].join(" ")}
                >
                  <td className="px-3 py-2 font-mono tabular-nums text-uq-3">{r.totalScore != null ? i + 1 : "—"}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-xs text-uq-2">{r.anonymousId}</td>
                  {revealed && <td className="px-3 py-2 font-medium text-uq">{r.name}</td>}
                  {revealed && <td className="px-3 py-2 text-xs text-uq-3">{r.email}</td>}
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-uq-2">{r.task1Score ?? <span className="text-uq-3">—</span>}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-uq-2">{r.task2Score ?? <span className="text-uq-3">—</span>}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-uq">
                    {r.totalScore != null ? r.totalScore : <span className="text-uq-3">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-mono tabular-nums text-uq-3">{r.timeTakenMin ?? "—"}m</td>
                  <td className="px-3 py-2 text-right text-xs font-mono tabular-nums text-uq-3">{r.candidateMessageCount}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={[
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border",
                      r.fullyMarked ? "bg-[var(--uq-success-soft)] border-[var(--uq-success-line)] text-[var(--uq-success-text)]" :
                      (r.task1Score != null || r.task2Score != null) ? "bg-[var(--uq-warn-soft)] border-[var(--uq-warn-line)] text-[var(--uq-warn-text)]" :
                      "border-uq bg-uq-elev2 text-uq-2",
                    ].join(" ")}>
                      {r.fullyMarked ? "marked" : (r.task1Score != null || r.task2Score != null) ? "partial" : r.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Reveal modal */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#16181D]/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div className="rounded-2xl border border-uq-strong bg-uq-elev3 shadow-uq-pop p-6 max-w-md w-full animate-uq-rise" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-uq">Reveal candidate names?</h3>
            <p className="text-sm leading-relaxed text-uq-2 mt-2">
              This will reveal the real names against scores for everyone with admin access to this assessment.
              <strong className="text-uq font-semibold"> This action cannot be undone.</strong>
            </p>
            <div className="mt-3 rounded-md p-3 text-xs bg-uq-elev2 border border-uq-faint text-uq-2">
              <span className="font-mono tabular-nums">{data.analytics.fullyMarkedCount}</span> of <span className="font-mono tabular-nums">{data.analytics.submittedCount}</span> submissions are fully marked.
              {data.analytics.fullyMarkedCount < data.analytics.submittedCount && (
                <div className="text-[color:var(--uq-warn-text)] mt-1">
                  Some candidates are not yet fully marked. They will still appear in the revealed list.
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-lg border border-uq-strong bg-uq-glass-subtle text-uq text-sm font-medium transition-colors hover:border-uq-accent hover:bg-uq-accent-soft focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
              >
                Cancel
              </button>
              <button
                onClick={() => void reveal()}
                disabled={revealing}
                className="px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium tracking-[-0.005em] shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
              >
                {revealing ? "Revealing…" : "Reveal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: number | string; accent?: "amber" | "green" }) {
  const accentColour =
    accent === "green" ? "border-l-[color:var(--uq-success-line)]" :
    accent === "amber" ? "border-l-[color:var(--uq-warn-line)]" :
    "border-l-uq-strong";
  return (
    <div className={`rounded-xl border border-uq bg-uq-elev1 shadow-uq-glass border-l-2 ${accentColour} p-3`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">{label}</div>
      <div className="text-2xl font-semibold font-mono tabular-nums text-uq">{value}</div>
    </div>
  );
}

function Box({ loading, error }: { loading?: boolean; error?: string }) {
  return (
    <div className="max-w-3xl mx-auto p-8">
      {loading && <div className="text-sm text-uq-3"><span className="font-mono text-[11px] uppercase tracking-[0.18em] text-uq-3 animate-pulse">Loading…</span></div>}
      {error && <div className="rounded-md px-3 py-2 text-sm border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">{error}</div>}
    </div>
  );
}
