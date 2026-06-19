"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface PerTaskCell { taskNumber: number; score: number | null; markedAt: string | null; wordCount: number }
interface MarkRow {
  id: string;
  anonymousId: string;
  startedAt: string;
  submittedAt: string;
  timeTakenMin: number | null;
  perTask: PerTaskCell[];
  totalScore: number | null;
  interactionCount: number;
  fullyMarked: boolean;
  anyMarked: boolean;
}

export default function MarkListPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = useSession();
  const [data, setData] = useState<{ candidates: MarkRow[]; summary: any; assessment: any; taskNumbers: number[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (status === "unauthenticated") router.push("/login"); }, [status, router]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/admin/recruitment/${params.id}/mark`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [params.id]);

  if (error) return <Box error={error} />;
  if (!data) return <Box loading />;

  const taskNumbers = data.taskNumbers ?? [1, 2];
  // 3 fixed left cols (anon/time/messages) + word col per task + score
  // col per task + total + action.
  const colCount = 3 + taskNumbers.length * 2 + 2;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 animate-uq-rise">
      <div className="text-xs">
        <Link href={`/admin/recruitment/${params.id}`} className="font-mono text-[11px] tracking-[0.04em] text-uq-accent hover:text-uq-accent-hover hover:underline underline-offset-2 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md">← Dashboard</Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-uq mt-2">Marking · {data.assessment.title}</h1>
      <div className="text-sm leading-relaxed text-uq-2 mt-1">
        Names are hidden. You see only anonymous IDs — names are revealed once marking is complete and you confirm the reveal.
      </div>

      <div className="grid sm:grid-cols-4 gap-3 mt-6">
        <KPI label="Submitted" value={data.summary.totalSubmitted} />
        <KPI label="Fully marked" value={data.summary.fullyMarked} accent="green" />
        <KPI label="Partially" value={data.summary.partiallyMarked} accent="amber" />
        <KPI label="Not yet marked" value={data.summary.unmarked} accent="amber" />
      </div>

      <div className="mt-6 flex gap-3">
        <Link
          href={`/admin/recruitment/${params.id}/results`}
          className="px-4 py-2 rounded-lg border border-uq-strong bg-uq-glass-subtle text-uq text-sm font-medium transition-colors hover:border-uq-accent hover:bg-uq-accent-soft hover:text-uq focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
        >
          View results &amp; ranking
        </Link>
      </div>

      <section className="mt-6 rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-uq-glass-subtle text-uq-3 font-mono text-[11px] uppercase tracking-[0.14em]">
            <tr>
              <th className="px-3 py-2 text-left">Anon ID</th>
              <th className="px-3 py-2 text-right">Time (min)</th>
              <th className="px-3 py-2 text-right">Messages</th>
              {taskNumbers.map((n) => (
                <th key={`w${n}`} className="px-3 py-2 text-right">T{n} words</th>
              ))}
              {taskNumbers.map((n) => (
                <th key={`s${n}`} className="px-3 py-2 text-right">T{n} score</th>
              ))}
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.candidates.length === 0 && (
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-sm text-uq-3 italic">No submissions yet.</td></tr>
            )}
            {data.candidates.map((c) => {
              const byTask = (n: number) => c.perTask.find((t) => t.taskNumber === n);
              return (
              <tr key={c.id} className="border-t border-uq-faint transition-colors hover:bg-uq-elev2">
                <td className="px-3 py-2 font-mono text-xs text-uq-accent">{c.anonymousId}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-uq-2">{c.timeTakenMin ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-uq-2">{c.interactionCount}</td>
                {taskNumbers.map((n) => (
                  <td key={`w${n}`} className="px-3 py-2 text-right font-mono tabular-nums text-uq-3">{byTask(n)?.wordCount ?? 0}</td>
                ))}
                {taskNumbers.map((n) => (
                  <td key={`s${n}`} className="px-3 py-2 text-right font-mono tabular-nums text-uq">{byTask(n)?.score ?? <span className="text-[color:var(--uq-warn-text)]">—</span>}</td>
                ))}
                <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-uq">
                  {c.totalScore != null ? c.totalScore : <span className="text-uq-3">—</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/admin/recruitment/${params.id}/mark/${c.id}`}
                    className={`text-sm font-medium hover:underline underline-offset-2 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md ${c.fullyMarked ? "text-uq-3" : "text-uq-accent hover:text-uq-accent-hover"}`}
                  >
                    {c.fullyMarked ? "Review" : "Mark →"}
                  </Link>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: number; accent?: "amber" | "green" }) {
  const accentColour =
    accent === "amber" ? "border-l-[color:var(--uq-warn-line)]" :
    accent === "green" ? "border-l-[color:var(--uq-success-line)]" :
    "border-l-uq-accent";
  return (
    <div className={`rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass border-l-2 ${accentColour} p-3`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">{label}</div>
      <div className="text-2xl font-semibold font-mono tabular-nums text-uq">{value}</div>
    </div>
  );
}

function Box({ loading, error }: { loading?: boolean; error?: string }) {
  return (
    <div className="max-w-3xl mx-auto p-8">
      {loading && <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-uq-3 animate-uq-pulse-glow">Loading…</div>}
      {error && <div className="rounded-lg border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)] text-sm px-3 py-2 animate-uq-rise">{error}</div>}
    </div>
  );
}
