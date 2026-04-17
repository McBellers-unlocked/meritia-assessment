"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface MarkRow {
  id: string;
  anonymousId: string;
  startedAt: string;
  submittedAt: string;
  timeTakenMin: number | null;
  task1: { score: number | null; markedAt: string | null; wordCount: number };
  task2: { score: number | null; markedAt: string | null; wordCount: number };
  totalScore: number | null;
  interactionCount: number;
  fullyMarked: boolean;
}

export default function MarkListPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = useSession();
  const [data, setData] = useState<{ candidates: MarkRow[]; summary: any; assessment: any } | null>(null);
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

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="text-xs">
        <Link href={`/admin/recruitment/${params.id}`} className="text-[#4B92DB] hover:underline">← Dashboard</Link>
      </div>
      <h1 className="text-2xl font-semibold text-[#1B2A4A] mt-2">Marking · {data.assessment.title}</h1>
      <div className="text-sm text-slate-500 mt-1">
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
          className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
        >
          View results &amp; ranking
        </Link>
      </div>

      <section className="mt-6 bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">Anon ID</th>
              <th className="px-3 py-2 text-right">Time (min)</th>
              <th className="px-3 py-2 text-right">Messages</th>
              <th className="px-3 py-2 text-right">T1 words</th>
              <th className="px-3 py-2 text-right">T2 words</th>
              <th className="px-3 py-2 text-right">T1 score</th>
              <th className="px-3 py-2 text-right">T2 score</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.candidates.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-4 text-sm text-slate-500">No submissions yet.</td></tr>
            )}
            {data.candidates.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs">{c.anonymousId}</td>
                <td className="px-3 py-2 text-right font-mono">{c.timeTakenMin ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{c.interactionCount}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-500">{c.task1.wordCount}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-500">{c.task2.wordCount}</td>
                <td className="px-3 py-2 text-right font-mono">{c.task1.score ?? <span className="text-amber-600">—</span>}</td>
                <td className="px-3 py-2 text-right font-mono">{c.task2.score ?? <span className="text-amber-600">—</span>}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold">
                  {c.totalScore != null ? c.totalScore : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/admin/recruitment/${params.id}/mark/${c.id}`}
                    className={`text-sm hover:underline ${c.fullyMarked ? "text-slate-500" : "text-[#4B92DB]"}`}
                  >
                    {c.fullyMarked ? "Review" : "Mark →"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: number; accent?: "amber" | "green" }) {
  const accentColour =
    accent === "amber" ? "border-amber-500" :
    accent === "green" ? "border-green-600" :
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
