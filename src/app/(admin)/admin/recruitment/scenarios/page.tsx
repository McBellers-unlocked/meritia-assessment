"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface ScenarioRow {
  id: string;
  slug: string;
  title: string;
  organisation: string;
  positionTitle: string;
  defaultTotalMinutes: number;
  status: string;
  publishedAt: string | null;
  updatedAt: string;
  taskCount: number;
  assessmentCount: number;
}

export default function ScenariosListPage() {
  const { status } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<ScenarioRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/recruitment/scenarios", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        setRows(body.scenarios);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 animate-uq-rise">
      <div className="text-xs">
        <Link href="/admin/recruitment" className="font-mono text-[11px] uppercase tracking-[0.14em] text-uq-accent hover:text-uq-accent-hover hover:underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md">← Recruitment assessments</Link>
      </div>

      <div className="flex items-center justify-between mb-6 mt-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-uq">Scenarios</h1>
          <p className="text-sm text-uq-2 mt-1">
            Author custom scenarios with memo + AI investigation, email inbox, and chat tasks.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/admin/recruitment/scenarios/new/from-wipo"
            className="px-5 py-2.5 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px inline-flex items-center gap-2 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            title="Browse currently open WIPO postings and build an assessment from one"
          >
            <span aria-hidden>✨</span>
            Build from WIPO open jobs
          </Link>
          <Link
            href="/admin/recruitment/scenarios/new/from-itu"
            className="px-5 py-2.5 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px inline-flex items-center gap-2 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            title="Browse currently open ITU postings and build an assessment from one"
          >
            <span aria-hidden>✨</span>
            Build from ITU open jobs
          </Link>
          <Link
            href="/admin/recruitment/scenarios/new/from-jd"
            className="text-sm text-uq-2 hover:text-uq hover:underline transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md"
            title="Upload a PDF/DOCX job description"
          >
            Upload your own JD
          </Link>
          <span className="text-uq-3" aria-hidden>
            ·
          </span>
          <Link
            href="/admin/recruitment/scenarios/new"
            className="text-sm text-uq-2 hover:text-uq hover:underline transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md"
            title="Start with a blank scenario"
          >
            Blank scenario
          </Link>
        </div>
      </div>

      {error && <div className="rounded-md px-3 py-2 mb-4 text-sm border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">{error}</div>}

      <section className="rounded-xl border border-uq bg-uq-elev1 shadow-uq-glass overflow-hidden">
        {rows === null && <div className="p-5 text-sm text-uq-3"><span className="font-mono text-[11px] uppercase tracking-[0.18em] text-uq-3 animate-pulse">Loading…</span></div>}
        {rows && rows.length === 0 && (
          <div className="p-8 text-center">
            <div className="text-sm text-uq-3 mb-3">No scenarios yet.</div>
            <Link
              href="/admin/recruitment/scenarios/new/from-wipo"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            >
              ✨ Build from WIPO open jobs
            </Link>
          </div>
        )}
        {rows && rows.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-uq-elev2 text-uq-3">
              <tr className="border-b border-uq-faint">
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Title</th>
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Status</th>
                <th className="px-4 py-2 text-right font-mono text-[11px] uppercase tracking-[0.14em]">Tasks</th>
                <th className="px-4 py-2 text-right font-mono text-[11px] uppercase tracking-[0.14em]">Cohorts</th>
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Updated</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-uq-faint transition-colors hover:bg-uq-elev2">
                  <td className="px-4 py-2">
                    <div className="font-medium text-uq">{s.title}</div>
                    <div className="text-xs text-uq-3">
                      {s.organisation} · <code className="font-mono text-[11px] bg-uq-elev2 border border-uq-faint text-uq px-1.5 rounded">{s.slug}</code> · {s.defaultTotalMinutes} min
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-uq-2">{s.taskCount}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-uq-2">{s.assessmentCount}</td>
                  <td className="px-4 py-2 text-xs text-uq-3">{new Date(s.updatedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/admin/recruitment/scenarios/${s.id}`}
                      className="text-uq-accent hover:text-uq-accent-hover hover:underline underline-offset-2 text-sm transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md"
                    >
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "published" ? "bg-[color:var(--uq-success-soft)] border-[color:var(--uq-success-line)] text-[color:var(--uq-success-text)]" :
    status === "archived" ? "border-uq bg-uq-elev2 text-uq-2" :
    "bg-[color:var(--uq-warn-soft)] border-[color:var(--uq-warn-line)] text-[color:var(--uq-warn-text)]";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${cls}`}>
      {status}
    </span>
  );
}
