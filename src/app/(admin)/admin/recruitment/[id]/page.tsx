"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface DashboardData {
  assessment: {
    id: string;
    title: string;
    scenarioSlug: string;
    scenarioId: string;
    totalMinutes: number;
    openDate: string;
    closeDate: string;
    revealedAt: string | null;
  };
  counts: { invited: number; started: number; submitted: number; expired: number };
  notStarted: { id: string; name: string; email: string }[];
  candidates: {
    id: string; name: string; email: string; token: string; anonymousId: string;
    status: string; startedAt: string | null; submittedAt: string | null; deadline: string | null;
  }[];
}

export default function AssessmentDashboardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { status: authStatus } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/login");
  }, [authStatus, router]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/admin/recruitment/${params.id}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [params.id]);

  if (error) return <div className="max-w-4xl mx-auto p-8"><div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">{error}</div></div>;
  if (!data) return <div className="max-w-4xl mx-auto p-8 text-sm text-slate-500">Loading…</div>;

  const totalCandidates = data.counts.invited + data.counts.started + data.counts.submitted + data.counts.expired;
  const closesIn = new Date(data.assessment.closeDate).getTime() - Date.now();
  const closesInLabel = closesIn > 0
    ? `${Math.floor(closesIn / 86_400_000)}d ${Math.floor((closesIn % 86_400_000) / 3_600_000)}h`
    : "Closed";

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="text-xs">
        <Link href="/admin/recruitment" className="text-[#4B92DB] hover:underline">← All assessments</Link>
      </div>
      <h1 className="text-2xl font-semibold text-[#1B2A4A] mt-2">{data.assessment.title}</h1>
      <div className="text-sm text-slate-500">
        Scenario <code className="text-xs bg-slate-100 px-1 rounded">{data.assessment.scenarioId}</code>
        · {data.assessment.totalMinutes} min per candidate
        · Open {new Date(data.assessment.openDate).toLocaleString()}
        → Close {new Date(data.assessment.closeDate).toLocaleString()}
      </div>

      <div className="grid sm:grid-cols-5 gap-3 mt-6">
        <KPI label="Invited" value={totalCandidates} />
        <KPI label="Not started" value={data.counts.invited} accent="amber" />
        <KPI label="In progress" value={data.counts.started} accent="blue" />
        <KPI label="Submitted" value={data.counts.submitted} accent="green" />
        <KPI label="Closes in" value={closesInLabel} small />
      </div>

      <div className="mt-6 flex gap-3 flex-wrap">
        <Link
          href={`/admin/recruitment/${data.assessment.id}/candidates`}
          className="px-4 py-2 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338]"
        >
          Manage candidates &amp; URLs
        </Link>
        <Link
          href={`/admin/recruitment/${data.assessment.id}/mark`}
          className="px-4 py-2 rounded-md border border-[#1B2A4A] text-[#1B2A4A] text-sm font-semibold hover:bg-slate-50"
        >
          Mark submissions ({data.counts.submitted})
        </Link>
        <Link
          href={`/admin/recruitment/${data.assessment.id}/results`}
          className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
        >
          Results &amp; ranking
        </Link>
        <a
          href={`/api/admin/recruitment/${data.assessment.id}/candidates.csv`}
          className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
        >
          Candidates CSV
        </a>
      </div>

      {data.notStarted.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-[#1B2A4A] mb-2">
            Yet to start ({data.notStarted.length}) — chase these
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
            <ul className="text-sm space-y-1">
              {data.notStarted.map((c) => (
                <li key={c.id}>
                  <span className="text-slate-700">{c.name}</span>
                  <span className="text-slate-500 ml-2">&lt;{c.email}&gt;</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-base font-semibold text-[#1B2A4A] mb-2">All candidates</h2>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left">Anon ID</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Token</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Started</th>
                <th className="px-4 py-2 text-left">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {data.candidates.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs">{c.anonymousId}</td>
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2 text-slate-600">{c.email}</td>
                  <td className="px-4 py-2 font-mono text-xs">{c.token}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={c.status} />
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{c.startedAt ? new Date(c.startedAt).toLocaleString() : "—"}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{c.submittedAt ? new Date(c.submittedAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KPI({ label, value, accent, small }: { label: string; value: number | string; accent?: "amber" | "blue" | "green"; small?: boolean }) {
  const accentColour =
    accent === "amber" ? "border-amber-500" :
    accent === "blue" ? "border-[#4B92DB]" :
    accent === "green" ? "border-green-600" :
    "border-[#1B2A4A]";
  return (
    <div className={`bg-white border border-slate-200 border-l-4 ${accentColour} rounded-md p-3`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={small ? "text-base font-semibold text-[#1B2A4A]" : "text-2xl font-bold text-[#1B2A4A]"}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "submitted" ? "bg-green-100 text-green-800" :
    status === "started"   ? "bg-blue-100 text-blue-800" :
    status === "expired"   ? "bg-slate-200 text-slate-700" :
    "bg-amber-100 text-amber-800";
  return <span className={`inline-block px-2 py-0.5 text-xs rounded ${cls}`}>{status}</span>;
}
