"use client";

import { useCallback, useEffect, useState } from "react";
import { AssessmentModeBadge } from "@/components/recruit/AssessmentModeBadge";
import type { EditorScenario } from "./scenarioEditorTypes";
import type { ValidationFinding, ValidationLabData } from "./validationLabTypes";
import AssessmentBlueprintMatrix from "./AssessmentBlueprintMatrix";
import ValidationFindingsList from "./ValidationFindingsList";
import SyntheticResponseViewer from "./SyntheticResponseViewer";
import PolicyTestResults from "./PolicyTestResults";
import HumanReviewPanel from "./HumanReviewPanel";

type LabTab = "overview" | "blueprint" | "findings" | "synthetic" | "policy" | "reviews" | "history";

export default function ValidationLabOverview({ scenario, onScenarioChanged }: { scenario: EditorScenario; onScenarioChanged: () => void }) {
  const [data, setData] = useState<ValidationLabData | null>(null);
  const [tab, setTab] = useState<LabTab>("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/recruitment/scenarios/${scenario.id}/validation`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    setData(body);
  }, [scenario.id]);
  useEffect(() => { void load().catch((e) => setError((e as Error).message)); }, [load]);
  const active = data?.runs.some((run) => run.status === "QUEUED" || run.status === "RUNNING") ?? false;
  useEffect(() => { if (!active) return; const id = setInterval(() => void load(), 3_000); return () => clearInterval(id); }, [active, load]);
  const run = async () => { setBusy(true); setError(null); try { const res = await fetch(`/api/admin/recruitment/scenarios/${scenario.id}/validation`, { method: "POST" }); const body = await res.json().catch(() => ({})); if (!res.ok) throw new Error(body.error || "Could not start preflight"); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const latest = data?.runs[0] ?? null;
  const disposition = async (findingId: string, next: ValidationFinding["disposition"], note: string) => { if (!latest) return; const res = await fetch(`/api/admin/recruitment/scenarios/${scenario.id}/validation/${latest.id}/findings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ findingId, disposition: next, reviewerNote: note }) }); const body = await res.json().catch(() => ({})); if (!res.ok) return setError(body.error || "Could not update finding"); await load(); };
  const refreshBlueprint = () => { void Promise.all([load(), Promise.resolve(onScenarioChanged())]); };

  if (!data) return <div className="rounded-xl border border-uq bg-uq-elev1 p-5 text-sm text-uq-3">{error || "Loading Validation Lab…"}</div>;
  const findings = latest?.findings ?? [];
  const counts = { blocker: findings.filter((item) => item.severity === "blocker" && item.disposition === "open").length, warning: findings.filter((item) => item.severity === "warning" && item.disposition === "open").length, note: findings.filter((item) => item.severity === "note" && item.disposition === "open").length };
  const tabs: Array<[LabTab, string]> = [["overview", "Overview"], ["blueprint", "Assessment Blueprint"], ["findings", `Findings (${findings.length})`], ["synthetic", "Synthetic Responses"], ["policy", "Knowledge System Tests"], ["reviews", "Human Reviews"], ["history", "Version History"]];
  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-uq bg-uq-elev1 p-5 shadow-uq-glass"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><AssessmentModeBadge mode={scenario.assessmentMode} /><span className="font-mono text-[10px] uppercase tracking-[0.12em] text-uq-3">Assessment Validation Lab</span></div><h2 className="mt-2 text-xl font-semibold text-uq">Design preflight and human approval</h2><p className="mt-1 max-w-3xl text-sm leading-relaxed text-uq-2">Automated preflight tests design assumptions and policy boundaries. It is not psychometric validation and cannot approve or edit the scenario.</p></div><button onClick={() => void run()} disabled={busy || active} className="rounded-lg bg-uq-accent px-4 py-2 text-sm font-medium text-[color:var(--uq-text-on-accent)] disabled:opacity-50">{active ? latest?.progressStage || "Preflight running…" : busy ? "Queueing…" : latest ? "Rerun preflight" : "Run preflight"}</button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4"><Metric label="Lifecycle" value={data.readiness.ready ? "Approved for pilot" : latest?.overallReadiness || "Preflight required"} /><Metric label="Current version" value={data.latestRunStale ? "Stale — scenario changed" : latest ? "Current" : "No run"} /><Metric label="Open findings" value={`${counts.blocker} blockers · ${counts.warning} warnings · ${counts.note} notes`} /><Metric label="Human approvals" value={`${data.reviews.filter((review) => review.validationRunId === latest?.id && review.decision !== "CHANGES_REQUIRED").length}/3`} /></div>
        <div className="mt-3 font-mono text-[10px] text-uq-3">Scenario hash: {data.currentHash}</div>
      </header>
      {error && <div className="rounded-lg border border-uq-danger-line bg-uq-danger-soft px-3 py-2 text-sm text-uq-danger-text">{error}</div>}
      <nav className="flex flex-wrap gap-1 rounded-lg bg-uq-elev2 p-1">{tabs.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`rounded-md px-3 py-1.5 text-xs ${tab === id ? "bg-uq-elev1 text-uq shadow-uq-e1" : "text-uq-3 hover:text-uq"}`}>{label}</button>)}</nav>
      <section className="rounded-xl border border-uq bg-uq-elev1 p-5 shadow-uq-glass">
        {tab === "overview" && <div className="space-y-5"><div><h3 className="font-semibold text-uq">Publication readiness</h3>{data.readiness.ready ? <p className="mt-2 text-sm text-uq-2">Automated preflight complete and required human reviews recorded for the current content hash.</p> : <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-uq-2">{data.readiness.blockers.map((item) => <li key={item}>{item}</li>)}</ul>}</div>{latest?.summary && <div><h3 className="font-semibold text-uq">Latest summary</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-uq-2">{latest.summary}</p></div>}<div><h3 className="font-semibold text-uq">Deterministic checks</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{(latest?.deterministicChecks ?? []).map((check) => <div key={check.id} className="rounded-lg border border-uq bg-uq-elev2 p-3 text-xs"><div className="font-medium text-uq">{check.passed ? "Complete" : "Gap"} · {check.label}</div><p className="mt-1 text-uq-3">{check.detail}</p></div>)}</div></div></div>}
        {tab === "blueprint" && <AssessmentBlueprintMatrix scenario={scenario} criteria={data.criteria} onChanged={refreshBlueprint} />}
        {tab === "findings" && <ValidationFindingsList findings={findings} onDisposition={disposition} />}
        {tab === "synthetic" && <SyntheticResponseViewer profiles={latest?.syntheticProfiles ?? []} />}
        {tab === "policy" && <PolicyTestResults tests={latest?.policyTests ?? []} />}
        {tab === "reviews" && <HumanReviewPanel scenarioId={scenario.id} runId={latest?.id ?? null} reviews={data.reviews} onChanged={() => void load()} />}
        {tab === "history" && <div className="space-y-3">{data.runs.map((item) => <article key={item.id} className="rounded-xl border border-uq bg-uq-elev2 p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-uq">{item.status} · {item.overallReadiness || item.progressStage}</span><time className="font-mono text-uq-3">{new Date(item.createdAt).toLocaleString()}</time></div><div className="mt-1 font-mono text-[10px] text-uq-3">{item.scenarioHash}{item.scenarioHash !== data.currentHash ? " · stale" : " · current"} · {item.model} · {item.promptVersion}</div>{item.error && <p className="mt-2 text-uq-danger-text">{item.error}</p>}</article>)}</div>}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-uq bg-uq-elev2 p-3"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-uq-3">{label}</div><div className="mt-1 text-sm font-medium text-uq">{value}</div></div>; }
