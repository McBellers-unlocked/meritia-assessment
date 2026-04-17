"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface AssessmentRow {
  id: string;
  title: string;
  scenarioSlug: string;
  scenarioId: string;
  totalMinutes: number;
  openDate: string;
  closeDate: string;
  revealedAt: string | null;
  candidateCount: number;
  counts: { invited: number; started: number; submitted: number; expired: number };
}

// One entry represents a scenario the admin can pick to create a cohort.
// Legacy scenarios (source: "legacy") live in code with a fixed scenarioId;
// custom scenarios (source: "custom") are DB-backed and addressed by their
// cuid. We keep both in the same dropdown for a single unified UX.
interface ScenarioOption {
  source: "legacy" | "custom";
  key: string;                // stable value for the <option>
  scenarioId: string;          // used when source="legacy"
  customScenarioId?: string;   // used when source="custom"
  label: string;
}

const LEGACY_OPTIONS: ScenarioOption[] = [
  {
    source: "legacy",
    key: "legacy:fam-p4-2026",
    scenarioId: "fam-p4-2026",
    label: "Finance and Accounting Manager (P4) — IDSC (built-in)",
  },
  {
    source: "legacy",
    key: "legacy:aplo-p2-2026",
    scenarioId: "aplo-p2-2026",
    label: "Associate Policy Officer (Legal) (P2) — IDSC (built-in)",
  },
];

export default function AdminRecruitmentList() {
  const { status } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<AssessmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [scenarioOptions, setScenarioOptions] = useState<ScenarioOption[]>(LEGACY_OPTIONS);

  // Create form state
  const [title, setTitle] = useState("Finance and Accounting Manager (P4)");
  const [scenarioKey, setScenarioKey] = useState<string>(LEGACY_OPTIONS[0].key);
  const [openDate, setOpenDate] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [totalMinutes, setTotalMinutes] = useState("90");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const reload = async () => {
    try {
      const res = await fetch("/api/admin/recruitment", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(data.assessments);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => { void reload(); }, []);

  // Pull published custom scenarios so admins can use them for new cohorts.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/recruitment/scenarios?status=published", { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        const custom: ScenarioOption[] = body.scenarios.map((s: { id: string; title: string; slug: string; positionTitle: string }) => ({
          source: "custom" as const,
          key: `custom:${s.id}`,
          scenarioId: s.slug,                // mirror only; server derives from customScenarioId
          customScenarioId: s.id,
          label: `${s.title} (custom)`,
        }));
        setScenarioOptions([...LEGACY_OPTIONS, ...custom]);
      } catch {
        // Non-fatal — admin can still use legacy options.
      }
    })();
  }, []);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const picked = scenarioOptions.find((o) => o.key === scenarioKey);
      if (!picked) throw new Error("Pick a scenario");
      const payload: Record<string, unknown> = {
        title,
        openDate: new Date(openDate).toISOString(),
        closeDate: new Date(closeDate).toISOString(),
        totalMinutes: Number(totalMinutes) || 90,
      };
      if (picked.source === "custom") {
        payload.customScenarioId = picked.customScenarioId;
      } else {
        payload.scenarioId = picked.scenarioId;
      }
      const res = await fetch("/api/admin/recruitment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      router.push(`/admin/recruitment/${body.assessment.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#1B2A4A]">Recruitment assessments</h1>
          <p className="text-sm text-slate-600 mt-1">Manage candidate cohorts, generate access tokens, and run blind marking.</p>
        </div>
      </div>

      {/* Create */}
      <section className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <h2 className="text-base font-semibold text-[#1B2A4A] mb-3">Create new assessment</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-slate-600">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Scenario</span>
            <select value={scenarioKey} onChange={(e) => setScenarioKey(e.target.value)} className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white">
              {scenarioOptions.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <span className="text-xs text-slate-500 mt-1 block">
              Need a new scenario? <Link href="/admin/recruitment/scenarios" className="text-[#4B92DB] hover:underline">Open the scenario builder</Link>.
            </span>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Open date</span>
            <input type="datetime-local" value={openDate} onChange={(e) => setOpenDate(e.target.value)} className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Close date</span>
            <input type="datetime-local" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Total minutes per candidate</span>
            <input type="number" value={totalMinutes} onChange={(e) => setTotalMinutes(e.target.value)} className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
          </label>
          <div className="flex items-end">
            <button
              onClick={create}
              disabled={creating || !title || !openDate || !closeDate}
              className="px-4 py-2 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338] disabled:bg-slate-300"
            >
              {creating ? "Creating…" : "Create assessment"}
            </button>
          </div>
        </div>
        {error && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
      </section>

      {/* List */}
      <section className="bg-white rounded-lg border border-slate-200">
        <div className="px-5 py-3 border-b border-slate-200 text-sm font-semibold text-[#1B2A4A]">Existing assessments</div>
        {rows === null && <div className="p-5 text-sm text-slate-500">Loading…</div>}
        {rows && rows.length === 0 && <div className="p-5 text-sm text-slate-500">None yet.</div>}
        {rows && rows.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left">Title</th>
                <th className="px-4 py-2 text-left">Window</th>
                <th className="px-4 py-2 text-right">Invited</th>
                <th className="px-4 py-2 text-right">Started</th>
                <th className="px-4 py-2 text-right">Submitted</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <div className="font-medium text-[#1B2A4A]">{a.title}</div>
                    <div className="text-xs text-slate-500">{a.scenarioSlug} · {a.totalMinutes} min</div>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {new Date(a.openDate).toLocaleDateString()} → {new Date(a.closeDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{a.counts.invited}</td>
                  <td className="px-4 py-2 text-right font-mono">{a.counts.started}</td>
                  <td className="px-4 py-2 text-right font-mono">{a.counts.submitted}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/recruitment/${a.id}`} className="text-[#4B92DB] hover:underline text-sm">Open →</Link>
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
