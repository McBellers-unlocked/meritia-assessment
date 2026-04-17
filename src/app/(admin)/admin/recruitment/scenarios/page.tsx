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
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="text-xs">
        <Link href="/admin/recruitment" className="text-[#4B92DB] hover:underline">← Recruitment assessments</Link>
      </div>

      <div className="flex items-center justify-between mb-6 mt-2">
        <div>
          <h1 className="text-2xl font-semibold text-[#1B2A4A]">Scenarios</h1>
          <p className="text-sm text-slate-600 mt-1">
            Author custom scenarios with memo + AI investigation, email inbox, and chat tasks.
          </p>
        </div>
        <Link
          href="/admin/recruitment/scenarios/new"
          className="px-4 py-2 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338]"
        >
          New scenario
        </Link>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2 mb-4">{error}</div>}

      <section className="bg-white rounded-lg border border-slate-200">
        {rows === null && <div className="p-5 text-sm text-slate-500">Loading…</div>}
        {rows && rows.length === 0 && (
          <div className="p-8 text-center">
            <div className="text-sm text-slate-500 mb-3">No scenarios yet.</div>
            <Link
              href="/admin/recruitment/scenarios/new"
              className="inline-block px-4 py-2 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338]"
            >
              Create your first scenario
            </Link>
          </div>
        )}
        {rows && rows.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left">Title</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Tasks</th>
                <th className="px-4 py-2 text-right">Cohorts</th>
                <th className="px-4 py-2 text-left">Updated</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <div className="font-medium text-[#1B2A4A]">{s.title}</div>
                    <div className="text-xs text-slate-500">
                      {s.organisation} · <code className="text-[11px] bg-slate-100 px-1 rounded">{s.slug}</code> · {s.defaultTotalMinutes} min
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{s.taskCount}</td>
                  <td className="px-4 py-2 text-right font-mono">{s.assessmentCount}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{new Date(s.updatedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/admin/recruitment/scenarios/${s.id}`}
                      className="text-[#4B92DB] hover:underline text-sm"
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
    status === "published" ? "bg-emerald-100 text-emerald-800" :
    status === "archived" ? "bg-slate-100 text-slate-600" :
    "bg-amber-100 text-amber-800";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
