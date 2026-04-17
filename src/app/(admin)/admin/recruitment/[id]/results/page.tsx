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
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="text-xs">
        <Link href={`/admin/recruitment/${params.id}`} className="text-[#4B92DB] hover:underline">← Dashboard</Link>
      </div>
      <div className="flex items-start justify-between mt-2 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1B2A4A]">Results · {data.assessment.title}</h1>
          <div className="text-sm text-slate-500 mt-1">
            {revealed
              ? <span className="text-green-700 font-medium">Names revealed at {new Date(data.assessment.revealedAt!).toLocaleString()}</span>
              : <span className="text-amber-700 font-medium">Blind mode — names hidden until you reveal</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <a
            href={`/api/admin/recruitment/${params.id}/results.csv`}
            className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
          >
            Download CSV
          </a>
          {!revealed && (
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={data.analytics.fullyMarkedCount === 0}
              className="px-4 py-2 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338] disabled:bg-slate-300"
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

      <section className="mt-8 bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-[#1B2A4A]">Score distribution</h2>
          <div className="text-xs text-slate-500">
            Avg Task 1: {data.analytics.averageTask1?.toFixed(1) ?? "—"} ·
            Avg Task 2: {data.analytics.averageTask2?.toFixed(1) ?? "—"} ·
            Messages↔Score r: {data.analytics.messageCountScoreCorrelation?.toFixed(2) ?? "—"}
          </div>
        </div>
        <div className="mt-4 flex items-end gap-1 h-32">
          {data.analytics.histogram.map((b) => (
            <div key={b.bucket} className="flex-1 flex flex-col items-center">
              <div className="text-[10px] text-slate-600 font-mono mb-1">{b.count || ""}</div>
              <div
                className="w-full bg-[#1B2A4A] rounded-t"
                style={{ height: `${(b.count / maxHist) * 100}%`, minHeight: b.count > 0 ? "2px" : "0" }}
              />
              <div className="text-[10px] text-slate-500 mt-1">{b.bucket}</div>
            </div>
          ))}
        </div>
      </section>

      {data.analytics.issueAnalytics.length > 0 && (
        <section className="mt-6 bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-[#1B2A4A]">Embedded issue identification</h2>
          <p className="text-xs text-slate-500 mt-1 mb-3">
            % of fully-marked candidates ({data.analytics.fullyMarkedCount}) who identified each embedded issue.
          </p>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
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
                  <tr key={iss.id} className="border-t border-slate-100">
                    <td className="py-1.5">{iss.title}</td>
                    <td className="py-1.5 text-right font-mono text-slate-500">{iss.maxMarks ?? "—"}</td>
                    <td className="py-1.5 text-right font-mono">{iss.identifiedCount}</td>
                    <td className="py-1.5 pl-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div className="bg-[#4B92DB] h-2" style={{ width: `${rate * 100}%` }} />
                        </div>
                        <span className="text-xs text-slate-600 font-mono w-12 text-right">{(rate * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-6 bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 text-sm font-semibold text-[#1B2A4A]">
          Ranking
          {revealed && <span className="ml-2 text-xs text-slate-500 font-normal">Top 5 highlighted</span>}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left w-12">Rank</th>
              <th className="px-3 py-2 text-left">Anon ID</th>
              {revealed && <th className="px-3 py-2 text-left">Name</th>}
              {revealed && <th className="px-3 py-2 text-left">Email</th>}
              <th className="px-3 py-2 text-right">T1</th>
              <th className="px-3 py-2 text-right">T2</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Time</th>
              <th className="px-3 py-2 text-right">Msgs</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.ranking.map((r, i) => {
              const isTop = revealed && top5Ids.has(r.candidateId);
              return (
                <tr
                  key={r.candidateId}
                  className={[
                    "border-t border-slate-100",
                    isTop ? "bg-amber-50" : "hover:bg-slate-50",
                  ].join(" ")}
                >
                  <td className="px-3 py-2 font-mono text-slate-500">{r.totalScore != null ? i + 1 : "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.anonymousId}</td>
                  {revealed && <td className="px-3 py-2 font-medium">{r.name}</td>}
                  {revealed && <td className="px-3 py-2 text-xs text-slate-500">{r.email}</td>}
                  <td className="px-3 py-2 text-right font-mono">{r.task1Score ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.task2Score ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {r.totalScore != null ? r.totalScore : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-slate-500">{r.timeTakenMin ?? "—"}m</td>
                  <td className="px-3 py-2 text-right text-xs text-slate-500">{r.candidateMessageCount}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={[
                      "inline-block px-2 py-0.5 text-xs rounded",
                      r.fullyMarked ? "bg-green-100 text-green-800" :
                      (r.task1Score != null || r.task2Score != null) ? "bg-amber-100 text-amber-800" :
                      "bg-slate-100 text-slate-600",
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
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[#1B2A4A]">Reveal candidate names?</h3>
            <p className="text-sm text-slate-600 mt-2">
              This will reveal the real names against scores for everyone with admin access to this assessment.
              <strong> This action cannot be undone.</strong>
            </p>
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-md p-3 text-xs text-slate-600">
              {data.analytics.fullyMarkedCount} of {data.analytics.submittedCount} submissions are fully marked.
              {data.analytics.fullyMarkedCount < data.analytics.submittedCount && (
                <div className="text-amber-700 mt-1">
                  Some candidates are not yet fully marked. They will still appear in the revealed list.
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void reveal()}
                disabled={revealing}
                className="px-4 py-2 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338] disabled:bg-slate-300"
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
    accent === "green" ? "border-green-600" :
    accent === "amber" ? "border-amber-500" :
    "border-[#1B2A4A]";
  return (
    <div className={`bg-white border border-slate-200 border-l-4 ${accentColour} rounded-md p-3`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-[#1B2A4A]">{value}</div>
    </div>
  );
}

function Box({ loading, error }: { loading?: boolean; error?: string }) {
  return (
    <div className="max-w-3xl mx-auto p-8">
      {loading && <div className="text-sm text-slate-500">Loading…</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">{error}</div>}
    </div>
  );
}
