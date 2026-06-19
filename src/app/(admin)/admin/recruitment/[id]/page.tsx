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

  if (error) return <div className="max-w-4xl mx-auto p-8"><div className="rounded-md px-3 py-2 text-sm border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">{error}</div></div>;
  if (!data) return <div className="max-w-4xl mx-auto p-8 text-sm text-uq-3"><span className="font-mono text-[11px] uppercase tracking-[0.18em] text-uq-3 animate-pulse">Loading…</span></div>;

  const totalCandidates = data.counts.invited + data.counts.started + data.counts.submitted + data.counts.expired;
  const closesIn = new Date(data.assessment.closeDate).getTime() - Date.now();
  const closesInLabel = closesIn > 0
    ? `${Math.floor(closesIn / 86_400_000)}d ${Math.floor((closesIn % 86_400_000) / 3_600_000)}h`
    : "Closed";

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 animate-uq-rise">
      <div className="text-xs">
        <Link href="/admin/recruitment" className="font-mono text-[11px] uppercase tracking-[0.14em] text-uq-accent hover:text-uq-accent-hover hover:underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md">← All assessments</Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-uq mt-2">{data.assessment.title}</h1>
      <div className="text-sm text-uq-3 mt-1">
        Scenario <code className="font-mono text-xs bg-uq-glass-subtle border border-uq-faint text-uq-cyan px-1.5 rounded">{data.assessment.scenarioId}</code>
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
          className="px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium tracking-[-0.005em] shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
        >
          Manage candidates &amp; URLs
        </Link>
        <Link
          href={`/admin/recruitment/${data.assessment.id}/mark`}
          className="px-4 py-2 rounded-lg border border-uq-strong bg-uq-glass-subtle text-uq text-sm font-medium transition-colors hover:border-uq-accent hover:bg-uq-accent-soft hover:text-uq focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
        >
          Mark submissions ({data.counts.submitted})
        </Link>
        <Link
          href={`/admin/recruitment/${data.assessment.id}/results`}
          className="px-4 py-2 rounded-lg border border-uq bg-uq-glass-subtle text-uq-2 text-sm font-medium transition-colors hover:border-uq-strong hover:bg-uq-elev2 hover:text-uq focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
        >
          Results &amp; ranking
        </Link>
        <a
          href={`/api/admin/recruitment/${data.assessment.id}/candidates.csv`}
          className="px-4 py-2 rounded-lg border border-uq bg-uq-glass-subtle text-uq-2 text-sm font-medium transition-colors hover:border-uq-strong hover:bg-uq-elev2 hover:text-uq focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
        >
          Candidates CSV
        </a>
      </div>

      {data.notStarted.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold tracking-[-0.005em] text-uq mb-2">
            Yet to start ({data.notStarted.length}) — chase these
          </h2>
          <div className="rounded-lg border border-[color:var(--uq-warn-line)] bg-[color:var(--uq-warn-soft)] p-4">
            <ul className="text-sm space-y-1">
              {data.notStarted.map((c) => (
                <li key={c.id}>
                  <span className="text-uq">{c.name}</span>
                  <span className="text-uq-3 ml-2">&lt;{c.email}&gt;</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-base font-semibold tracking-[-0.005em] text-uq mb-2">All candidates</h2>
        <div className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-uq-glass-subtle text-uq-3">
              <tr className="border-b border-uq-faint">
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Anon ID</th>
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Name</th>
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Email</th>
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Token</th>
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Status</th>
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Started</th>
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {data.candidates.map((c) => (
                <tr key={c.id} className="border-t border-uq-faint transition-colors hover:bg-uq-elev2">
                  <td className="px-4 py-2 font-mono tabular-nums text-xs text-uq-2">{c.anonymousId}</td>
                  <td className="px-4 py-2 text-uq">{c.name}</td>
                  <td className="px-4 py-2 text-uq-2">{c.email}</td>
                  <td className="px-4 py-2 font-mono tabular-nums text-xs text-uq-2">{c.token}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={c.status} />
                  </td>
                  <td className="px-4 py-2 text-xs text-uq-3">{c.startedAt ? new Date(c.startedAt).toLocaleString() : "—"}</td>
                  <td className="px-4 py-2 text-xs text-uq-3">{c.submittedAt ? new Date(c.submittedAt).toLocaleString() : "—"}</td>
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
    accent === "amber" ? "border-l-[color:var(--uq-warn-line)]" :
    accent === "blue" ? "border-l-uq-accent" :
    accent === "green" ? "border-l-[color:var(--uq-success-line)]" :
    "border-l-uq-strong";
  return (
    <div className={`rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass border-l-2 ${accentColour} p-3`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">{label}</div>
      <div className={small ? "text-base font-semibold font-mono text-uq" : "text-2xl font-semibold font-mono tabular-nums text-uq"}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "submitted" ? "bg-[var(--uq-success-soft)] border-[var(--uq-success-line)] text-[var(--uq-success-text)]" :
    status === "started"   ? "bg-uq-accent-soft border-uq-accent text-uq" :
    status === "expired"   ? "border-uq bg-uq-elev2 text-uq-2" :
    "bg-[var(--uq-warn-soft)] border-[var(--uq-warn-line)] text-[var(--uq-warn-text)]";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${cls}`}>{status}</span>;
}
