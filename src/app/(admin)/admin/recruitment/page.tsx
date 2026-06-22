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

function deriveTitleFromLabel(label: string): string {
  return label
    .replace(/\s*—\s*[^(]*\(built-in\)\s*$/, "")
    .replace(/\s*\(custom\)\s*$/, "")
    .trim();
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
  {
    source: "legacy",
    key: "legacy:cso-p3-2026",
    scenarioId: "cso-p3-2026",
    label: "Cybersecurity Operations Officer (P3) — IDSC (built-in)",
  },
  // IPAC is shipped as an editable DB scenario (ported from code) so its IM is
  // configurable in the builder; it appears in the dropdown via the published
  // custom-scenarios fetch below, not as a legacy/code option.
];

export default function AdminRecruitmentList() {
  const { status } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<AssessmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [scenarioOptions, setScenarioOptions] = useState<ScenarioOption[]>(LEGACY_OPTIONS);

  // Create form state
  const [title, setTitle] = useState(deriveTitleFromLabel(LEGACY_OPTIONS[0].label));
  const [scenarioKey, setScenarioKey] = useState<string>(LEGACY_OPTIONS[0].key);
  const [openDate, setOpenDate] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [totalMinutes, setTotalMinutes] = useState("90");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // When the admin picks a different scenario, refresh the cohort title to
  // match. Admin can still type over it; the next scenario change re-applies.
  useEffect(() => {
    const picked = scenarioOptions.find((o) => o.key === scenarioKey);
    if (picked) setTitle(deriveTitleFromLabel(picked.label));
  }, [scenarioKey, scenarioOptions]);

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
    <div className="max-w-5xl mx-auto px-6 py-8 animate-uq-rise">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-uq">Recruitment assessments</h1>
          <p className="text-sm leading-relaxed text-uq-2 mt-1">Manage candidate cohorts, generate access tokens, and run blind marking.</p>
        </div>
      </div>

      {/* Create */}
      <section className="rounded-xl border border-uq bg-uq-elev1 shadow-uq-glass p-5 mb-6">
        <h2 className="text-base font-semibold tracking-[-0.005em] text-uq mb-3">Create new assessment</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:bg-uq-elev1 focus:shadow-[var(--uq-glow-soft)] focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]" />
          </label>
          <label className="block text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Scenario</span>
            <select value={scenarioKey} onChange={(e) => setScenarioKey(e.target.value)} className="mt-1 block w-full rounded-md border border-uq bg-uq-elev1 px-3 py-2 text-sm text-uq appearance-none focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] [&>option]:bg-uq-elev2 [&>option]:text-uq">
              {scenarioOptions.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <span className="text-xs text-uq-3 mt-1 block">
              Need a new scenario? <Link href="/admin/recruitment/scenarios" className="text-uq-accent hover:text-uq-accent-hover hover:underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md">Open the scenario builder</Link>.
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Open date</span>
            <input type="datetime-local" value={openDate} onChange={(e) => setOpenDate(e.target.value)} className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:bg-uq-elev1 focus:shadow-[var(--uq-glow-soft)] focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]" />
          </label>
          <label className="block text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Close date</span>
            <input type="datetime-local" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:bg-uq-elev1 focus:shadow-[var(--uq-glow-soft)] focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]" />
          </label>
          <label className="block text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Total minutes per candidate</span>
            <input type="number" value={totalMinutes} onChange={(e) => setTotalMinutes(e.target.value)} className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:bg-uq-elev1 focus:shadow-[var(--uq-glow-soft)] focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]" />
          </label>
          <div className="flex items-end">
            <button
              onClick={create}
              disabled={creating || !title || !openDate || !closeDate}
              className="px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium tracking-[-0.005em] shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            >
              {creating ? "Creating…" : "Create assessment"}
            </button>
          </div>
        </div>
        {error && <div className="mt-3 text-sm rounded-md px-3 py-2 border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">{error}</div>}
      </section>

      {/* List */}
      <section className="rounded-xl border border-uq bg-uq-elev1 shadow-uq-glass overflow-hidden">
        <div className="px-5 py-3 border-b border-uq-faint bg-uq-elev2 text-sm font-semibold text-uq">Existing assessments</div>
        {rows === null && <div className="p-5 text-sm text-uq-3"><span className="font-mono text-[11px] uppercase tracking-[0.18em] text-uq-3 animate-pulse">Loading…</span></div>}
        {rows && rows.length === 0 && <div className="p-5 text-sm text-uq-3">None yet.</div>}
        {rows && rows.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-uq-elev2 text-uq-3">
              <tr className="border-b border-uq-faint">
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Title</th>
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Window</th>
                <th className="px-4 py-2 text-right font-mono text-[11px] uppercase tracking-[0.14em]">Invited</th>
                <th className="px-4 py-2 text-right font-mono text-[11px] uppercase tracking-[0.14em]">Started</th>
                <th className="px-4 py-2 text-right font-mono text-[11px] uppercase tracking-[0.14em]">Submitted</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-uq-faint transition-colors hover:bg-uq-elev2">
                  <td className="px-4 py-2">
                    <div className="font-medium text-uq">{a.title}</div>
                    <div className="text-xs text-uq-3">{a.scenarioSlug} · {a.totalMinutes} min</div>
                  </td>
                  <td className="px-4 py-2 text-xs text-uq-3">
                    {new Date(a.openDate).toLocaleDateString()} → {new Date(a.closeDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-uq">{a.counts.invited}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-uq">{a.counts.started}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-uq">{a.counts.submitted}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/recruitment/${a.id}`} className="font-mono text-xs uppercase tracking-[0.12em] text-uq-accent hover:text-uq-accent-hover hover:underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md">Open →</Link>
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
