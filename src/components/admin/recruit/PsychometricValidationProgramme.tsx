"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { EditorScenario } from "./scenarioEditorTypes";

const EVIDENCE_LABELS: Record<string, string> = {
  CONTENT: "Content and job relevance",
  RESPONSE_PROCESS: "Candidate response process",
  RATER_RELIABILITY: "Rater reliability and precision",
  RELATIONS_TO_OTHER_VARIABLES: "Relations to other variables",
  FAIRNESS: "Fairness and adjustments",
  CONSEQUENCES: "Consequences and monitoring",
};

interface Dashboard {
  currentHash: string;
  raters: Array<{ id: string; name: string | null; email: string }>;
  assessments: Array<{
    id: string;
    title: string;
    assessmentVersionId: string | null;
    openDate: string;
    closeDate: string;
    counts: Record<string, number>;
  }>;
  programmes: Programme[];
}

interface Programme {
  id: string;
  name: string;
  intendedUse: string;
  targetPopulation: string;
  constructDefinition: string;
  decisionContext: string;
  status: string;
  conclusion: string;
  limitations: string | null;
  independentReviewerName: string | null;
  independentReviewerCredentials: string | null;
  reviewedAt: string | null;
  versionCurrent: boolean;
  assessmentVersion: {
    id: string;
    label: string;
    scenarioHash: string;
    assessmentMode: string;
    createdAt: string;
  };
  readiness: { ready: boolean; gaps: string[] };
  evidenceRecords: EvidenceRecord[];
  pilotCohorts: Array<{
    id: string;
    versionBasis: string;
    retrospectiveAttestation: string | null;
    assessment: {
      id: string;
      title: string;
      counts: Record<string, number>;
    };
  }>;
  raterAssignments: Array<{
    id: string;
    candidateId: string;
    raterId: string;
    sequence: number;
    status: string;
    dueAt: string | null;
    candidate: { id: string; anonymousId: string };
    rater: { id: string; name: string | null; email: string };
  }>;
  assignmentSummary: {
    total: number;
    assigned: number;
    inProgress: number;
    submitted: number;
    distinctRaters: number;
  };
  reliability: {
    doubleRatedCandidates: number;
    commonRaters: number;
    absoluteAgreementIcc: number | null;
    meanAbsoluteDifference: number | null;
    withinFiveMarksRate: number | null;
    note: string;
  };
}

interface EvidenceRecord {
  id: string;
  category: string;
  status: string;
  summary: string | null;
  methodology: string | null;
  sampleDescription: string | null;
  findings: string | null;
  limitations: string | null;
}

type ProgrammeSection = "protocol" | "pilot" | "raters" | "evidence" | "review";

export default function PsychometricValidationProgramme({ scenario }: { scenario: EditorScenario }) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string | null>(null);
  const [section, setSection] = useState<ProgrammeSection>("protocol");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/recruitment/scenarios/${scenario.id}/psychometrics`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    setDashboard(body as Dashboard);
    setSelectedProgrammeId((current) => current ?? body.programmes[0]?.id ?? null);
  }, [scenario.id]);

  useEffect(() => { void load().catch((cause) => setError((cause as Error).message)); }, [load]);
  const programme = dashboard?.programmes.find((item) => item.id === selectedProgrammeId) ?? null;

  const mutate = async (path: string, init: RequestInit) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(path, init);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not update the validation programme.");
      if (body.dashboard) setDashboard(body.dashboard as Dashboard);
      else setDashboard(body as Dashboard);
      setMessage("Validation programme updated.");
      return body;
    } catch (cause) {
      setError((cause as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (!dashboard) {
    return <div className="rounded-xl border border-uq bg-uq-elev1 p-5 text-sm text-uq-3">{error || "Loading Validation Programme…"}</div>;
  }

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-uq bg-uq-elev1 p-5 shadow-uq-glass">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-uq-3">Validation Programme · empirical evidence</div>
        <h2 className="mt-2 text-xl font-semibold text-uq">Build a version-specific validity argument</h2>
        <p className="mt-1 max-w-4xl text-sm leading-relaxed text-uq-2">
          This programme manages real study evidence. It does not generate psychometric conclusions, infer fairness from synthetic candidates or apply an undisclosed selection score. Any supportive conclusion requires all evidence domains and an identified independent reviewer.
        </p>
      </header>

      {(error || message) && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${error ? "border-uq-danger-line bg-uq-danger-soft text-uq-danger-text" : "border-uq-accent bg-uq-accent-soft text-uq"}`}>
          {error || message}
        </div>
      )}

      {dashboard.programmes.length === 0 ? (
        <CreateProgramme scenario={scenario} busy={busy} onCreate={async (payload) => {
          const body = await mutate(`/api/admin/recruitment/scenarios/${scenario.id}/psychometrics`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (body?.programmeId) setSelectedProgrammeId(body.programmeId);
        }} />
      ) : programme ? (
        <>
          <ProgrammeHeader programme={programme} programmes={dashboard.programmes} selectedId={programme.id} onSelect={setSelectedProgrammeId} />
          <nav className="flex flex-wrap gap-1 rounded-lg bg-uq-elev2 p-1">
            {([
              ["protocol", "Protocol"],
              ["pilot", `Pilot cohorts (${programme.pilotCohorts.length})`],
              ["raters", `Independent ratings (${programme.assignmentSummary.submitted}/${programme.assignmentSummary.total})`],
              ["evidence", "Evidence domains"],
              ["review", "Independent review"],
            ] as Array<[ProgrammeSection, string]>).map(([id, label]) => (
              <button key={id} onClick={() => setSection(id)} className={`rounded-md px-3 py-1.5 text-xs ${section === id ? "bg-uq-elev1 text-uq shadow-uq-e1" : "text-uq-3 hover:text-uq"}`}>{label}</button>
            ))}
          </nav>

          {section === "protocol" && <ProtocolSection programme={programme} busy={busy} onSave={(payload) => mutate(programmePath(scenario.id, programme.id), jsonPatch({ action: "update_protocol", ...payload }))} />}
          {section === "pilot" && <PilotSection programme={programme} assessments={dashboard.assessments} busy={busy} onLink={(payload) => mutate(programmePath(scenario.id, programme.id), jsonPatch({ action: "link_cohort", ...payload }))} />}
          {section === "raters" && <RaterSection programme={programme} raters={dashboard.raters} currentUserId={currentUserId} busy={busy} onAssign={(payload) => mutate(programmePath(scenario.id, programme.id), jsonPatch({ action: "assign_raters", ...payload }))} />}
          {section === "evidence" && <EvidenceSection records={programme.evidenceRecords} busy={busy} onSave={(payload) => mutate(programmePath(scenario.id, programme.id), jsonPatch({ action: "update_evidence", ...payload }))} />}
          {section === "review" && <ReviewSection programme={programme} busy={busy} onSave={(payload) => mutate(programmePath(scenario.id, programme.id), jsonPatch({ action: "record_review", ...payload }))} />}
        </>
      ) : null}
    </div>
  );
}

function ProgrammeHeader({ programme, programmes, selectedId, onSelect }: { programme: Programme; programmes: Programme[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <section className="rounded-xl border border-uq bg-uq-elev1 p-5 shadow-uq-glass">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-uq px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-uq-2">{programme.status.replaceAll("_", " ")}</span>
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${programme.versionCurrent ? "border-uq-accent text-uq-accent" : "border-uq-danger-line text-uq-danger-text"}`}>{programme.versionCurrent ? "current version" : "frozen older version"}</span>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-uq">{programme.name}</h3>
          <div className="mt-1 font-mono text-[10px] text-uq-3">{programme.assessmentVersion.label} · {programme.assessmentVersion.scenarioHash}</div>
        </div>
        {programmes.length > 1 && (
          <select value={selectedId} onChange={(event) => onSelect(event.target.value)} className="rounded-lg border border-uq bg-uq-elev2 px-3 py-2 text-xs text-uq">
            {programmes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric label="Study readiness" value={programme.readiness.ready ? "Ready to run" : `${programme.readiness.gaps.length} gap(s)`} />
        <Metric label="Pilot submissions" value={String(programme.pilotCohorts.reduce((sum, link) => sum + (link.assessment.counts.submitted ?? 0), 0))} />
        <Metric label="Independent raters" value={String(programme.assignmentSummary.distinctRaters)} />
        <Metric label="Evidence conclusion" value={programme.conclusion.replaceAll("_", " ")} />
      </div>
      {!programme.readiness.ready && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-uq-2">{programme.readiness.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>}
    </section>
  );
}

function CreateProgramme({ scenario, busy, onCreate }: { scenario: EditorScenario; busy: boolean; onCreate: (payload: Record<string, string>) => Promise<void> }) {
  const criterionNames = (scenario.criteria ?? []).map((criterion) => criterion.name).join(", ");
  const [form, setForm] = useState({
    name: `${scenario.title} validation programme`,
    intendedUse: `Scores from the ${scenario.assessmentMode.replaceAll("_", " ")} assessment support structured human selection decisions for ${scenario.positionTitle} appointments.`,
    targetPopulation: `Applicants for ${scenario.positionTitle} roles in the jurisdictions and organisational contexts documented by the study.`,
    constructDefinition: criterionNames
      ? `Job-relevant performance evidenced through ${criterionNames}. The study must test whether the frozen tasks and rubric support these interpretations and document what the score does not measure.`
      : "Job-relevant performance represented by the frozen task and rubric. The study must establish the intended constructs and document what the score does not measure.",
    decisionContext: "Human-reviewed evidence used alongside other job-relevant selection information; not a sole or automatically applied hiring decision.",
  });
  return (
    <section className="rounded-xl border border-uq bg-uq-elev1 p-5 shadow-uq-glass">
      <h3 className="font-semibold text-uq">Create the first study programme</h3>
      <p className="mt-1 text-sm text-uq-2">Creation freezes the current scenario, exhibits, rubric, criteria and AI policy into an immutable version.</p>
      <div className="mt-4 grid gap-4">
        <Field label="Programme name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <TextField label="Intended score interpretation and use" value={form.intendedUse} onChange={(intendedUse) => setForm({ ...form, intendedUse })} />
        <TextField label="Target population" value={form.targetPopulation} onChange={(targetPopulation) => setForm({ ...form, targetPopulation })} />
        <TextField label="Construct definition" value={form.constructDefinition} onChange={(constructDefinition) => setForm({ ...form, constructDefinition })} rows={5} />
        <TextField label="Decision context" value={form.decisionContext} onChange={(decisionContext) => setForm({ ...form, decisionContext })} />
      </div>
      <button disabled={busy} onClick={() => void onCreate(form)} className="mt-4 rounded-lg bg-uq-accent px-4 py-2 text-sm font-medium text-[color:var(--uq-text-on-accent)] disabled:opacity-50">Freeze version and create programme</button>
    </section>
  );
}

function ProtocolSection({ programme, busy, onSave }: { programme: Programme; busy: boolean; onSave: (payload: Record<string, string>) => Promise<unknown> }) {
  const [form, setForm] = useState({ name: programme.name, intendedUse: programme.intendedUse, targetPopulation: programme.targetPopulation, constructDefinition: programme.constructDefinition, decisionContext: programme.decisionContext, status: programme.status });
  useEffect(() => setForm({ name: programme.name, intendedUse: programme.intendedUse, targetPopulation: programme.targetPopulation, constructDefinition: programme.constructDefinition, decisionContext: programme.decisionContext, status: programme.status }), [programme]);
  return (
    <section className="rounded-xl border border-uq bg-uq-elev1 p-5 shadow-uq-glass">
      <h3 className="font-semibold text-uq">Validation protocol</h3>
      <p className="mt-1 text-xs leading-relaxed text-uq-3">These statements delimit the claim. A changed role, population, mode, rubric or decision use may require a new programme.</p>
      <div className="mt-4 grid gap-4">
        <Field label="Programme name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <TextField label="Intended score interpretation and use" value={form.intendedUse} onChange={(intendedUse) => setForm({ ...form, intendedUse })} />
        <TextField label="Target population" value={form.targetPopulation} onChange={(targetPopulation) => setForm({ ...form, targetPopulation })} />
        <TextField label="Construct definition" value={form.constructDefinition} onChange={(constructDefinition) => setForm({ ...form, constructDefinition })} rows={5} />
        <TextField label="Decision context" value={form.decisionContext} onChange={(decisionContext) => setForm({ ...form, decisionContext })} />
        <label className="text-sm font-medium text-uq">Programme stage<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="mt-1 block w-full rounded-lg border border-uq bg-uq-elev2 px-3 py-2 text-sm text-uq">{["DRAFT", "STUDY_READY", "PILOT_ACTIVE", "ANALYSIS", "EVIDENCE_REVIEW", "ARCHIVED"].map((status) => <option key={status}>{status}</option>)}</select></label>
      </div>
      <button disabled={busy} onClick={() => void onSave(form)} className="mt-4 rounded-lg bg-uq-accent px-4 py-2 text-sm font-medium text-[color:var(--uq-text-on-accent)] disabled:opacity-50">Save protocol</button>
    </section>
  );
}

function PilotSection({ programme, assessments, busy, onLink }: { programme: Programme; assessments: Dashboard["assessments"]; busy: boolean; onLink: (payload: Record<string, string>) => Promise<unknown> }) {
  const linkedIds = new Set(programme.pilotCohorts.map((link) => link.assessment.id));
  const options = assessments.filter((assessment) => !linkedIds.has(assessment.id));
  const [assessmentId, setAssessmentId] = useState(options[0]?.id ?? "");
  const [attestation, setAttestation] = useState("");
  const selected = assessments.find((assessment) => assessment.id === assessmentId);
  const started = selected ? Object.entries(selected.counts).some(([status, count]) => status !== "invited" && count > 0) : false;
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-uq bg-uq-elev1 p-5 shadow-uq-glass">
        <h3 className="font-semibold text-uq">Version-matched pilot cohorts</h3>
        <p className="mt-1 text-xs leading-relaxed text-uq-3">New cohorts are frozen automatically. Historical cohorts require a documented attestation and remain explicitly labelled retrospective.</p>
        {programme.pilotCohorts.length > 0 && <div className="mt-4 space-y-2">{programme.pilotCohorts.map((link) => <div key={link.id} className="rounded-lg border border-uq-faint bg-uq-elev2 p-3 text-sm"><div className="font-medium text-uq">{link.assessment.title}</div><div className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-uq-3">{link.versionBasis.replaceAll("_", " ")} · {link.assessment.counts.submitted ?? 0} submitted</div>{link.retrospectiveAttestation && <p className="mt-2 text-xs text-uq-2">{link.retrospectiveAttestation}</p>}</div>)}</div>}
        {options.length > 0 ? <div className="mt-4 border-t border-uq-faint pt-4"><label className="text-sm font-medium text-uq">Cohort<select value={assessmentId} onChange={(event) => setAssessmentId(event.target.value)} className="mt-1 block w-full rounded-lg border border-uq bg-uq-elev2 px-3 py-2 text-sm text-uq">{options.map((assessment) => <option key={assessment.id} value={assessment.id}>{assessment.title} · {assessment.counts.submitted ?? 0} submitted</option>)}</select></label>{started && !selected?.assessmentVersionId && <div className="mt-3"><TextField label="Retrospective version attestation" value={attestation} onChange={setAttestation} rows={4} /><p className="mt-1 text-[11px] text-uq-3">Document how you established which scenario, exhibits and rubric participants actually received, plus any uncertainty.</p></div>}<button disabled={busy || !assessmentId} onClick={() => void onLink({ assessmentId, retrospectiveAttestation: attestation })} className="mt-3 rounded-lg bg-uq-accent px-4 py-2 text-sm font-medium text-[color:var(--uq-text-on-accent)] disabled:opacity-50">Link pilot cohort</button></div> : <p className="mt-4 text-sm text-uq-3">No additional cohorts are available for this scenario.</p>}
      </section>
    </div>
  );
}

function RaterSection({ programme, raters, currentUserId, busy, onAssign }: { programme: Programme; raters: Dashboard["raters"]; currentUserId: string; busy: boolean; onAssign: (payload: { assessmentId: string; raterIds: string[]; dueAt: string }) => Promise<unknown> }) {
  const [assessmentId, setAssessmentId] = useState(programme.pilotCohorts[0]?.assessment.id ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState("");
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const grouped = useMemo(() => {
    const rows = new Map<string, Programme["raterAssignments"]>();
    for (const assignment of programme.raterAssignments) rows.set(assignment.candidateId, [...(rows.get(assignment.candidateId) ?? []), assignment]);
    return Array.from(rows.values());
  }, [programme.raterAssignments]);
  const reliability = programme.reliability;
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-uq bg-uq-elev1 p-5 shadow-uq-glass">
        <h3 className="font-semibold text-uq">Independent rater study</h3>
        <p className="mt-1 text-xs leading-relaxed text-uq-3">Assignments are blind and separate from operational marks. Raters cannot see identity, provenance, dialogue, operational scores or another rater&apos;s scores.</p>
        {programme.pilotCohorts.length > 0 && <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium text-uq">Pilot cohort<select value={assessmentId} onChange={(event) => setAssessmentId(event.target.value)} className="mt-1 block w-full rounded-lg border border-uq bg-uq-elev2 px-3 py-2 text-sm text-uq">{programme.pilotCohorts.map((link) => <option key={link.assessment.id} value={link.assessment.id}>{link.assessment.title}</option>)}</select></label><label className="text-sm font-medium text-uq">Due date (optional)<input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="mt-1 block w-full rounded-lg border border-uq bg-uq-elev2 px-3 py-2 text-sm text-uq" /></label><div className="md:col-span-2"><div className="text-sm font-medium text-uq">Select at least two raters</div><div className="mt-2 grid gap-2 sm:grid-cols-2">{raters.map((rater) => <label key={rater.id} className="flex items-center gap-2 rounded-lg border border-uq-faint bg-uq-elev2 p-3 text-xs text-uq-2"><input type="checkbox" checked={selected.includes(rater.id)} onChange={() => toggle(rater.id)} /><span><strong className="text-uq">{rater.name || rater.email}</strong><br />{rater.email}</span></label>)}</div></div><button disabled={busy || selected.length < 2 || !assessmentId} onClick={() => void onAssign({ assessmentId, raterIds: selected, dueAt })} className="w-fit rounded-lg bg-uq-accent px-4 py-2 text-sm font-medium text-[color:var(--uq-text-on-accent)] disabled:opacity-50">Assign submitted candidates</button></div>}
      </section>

      <section className="rounded-xl border border-uq bg-uq-elev1 p-5 shadow-uq-glass">
        <h3 className="font-semibold text-uq">Rating progress</h3>
        {grouped.length === 0 ? (
          <p className="mt-2 text-sm text-uq-3">No assignments yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left font-mono text-[10px] uppercase tracking-[0.12em] text-uq-3">
                <tr><th className="py-2">Candidate</th><th>Rater</th><th>Status</th><th className="text-right">Action</th></tr>
              </thead>
              <tbody>
                {grouped.flatMap((rows) => rows.map((assignment) => (
                  <tr key={assignment.id} className="border-t border-uq-faint">
                    <td className="py-2 font-mono text-xs text-uq-2">{assignment.candidate.anonymousId}</td>
                    <td className="text-xs text-uq-2">{assignment.rater.name || assignment.rater.email}</td>
                    <td className="font-mono text-[10px] uppercase text-uq-3">{assignment.status.replaceAll("_", " ")}</td>
                    <td className="text-right">
                      {assignment.raterId === currentUserId ? (
                        <Link href={`/admin/recruitment/psychometrics/${programme.id}/rate/${assignment.candidate.id}`} className="text-xs text-uq-accent hover:underline">
                          {assignment.status === "SUBMITTED" ? "View locked rating" : "Rate independently →"}
                        </Link>
                      ) : <span className="text-xs text-uq-3">Independent</span>}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-uq bg-uq-elev1 p-5 shadow-uq-glass">
        <h3 className="font-semibold text-uq">Descriptive reliability</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-4"><Metric label="Double-rated candidates" value={String(reliability.doubleRatedCandidates)} /><Metric label="Absolute-agreement ICC" value={reliability.absoluteAgreementIcc?.toFixed(3) ?? "Not estimable"} /><Metric label="Mean absolute difference" value={reliability.meanAbsoluteDifference?.toFixed(1) ?? "—"} /><Metric label="Within 5 marks" value={reliability.withinFiveMarksRate == null ? "—" : `${Math.round(reliability.withinFiveMarksRate * 100)}%`} /></div><p className="mt-3 text-xs leading-relaxed text-uq-3">{reliability.note}</p>
      </section>
    </div>
  );
}

function EvidenceSection({ records, busy, onSave }: { records: EvidenceRecord[]; busy: boolean; onSave: (payload: Record<string, string>) => Promise<unknown> }) {
  return <div className="space-y-3">{records.map((record) => <EvidenceEditor key={record.id} record={record} busy={busy} onSave={onSave} />)}</div>;
}

function EvidenceEditor({ record, busy, onSave }: { record: EvidenceRecord; busy: boolean; onSave: (payload: Record<string, string>) => Promise<unknown> }) {
  const [open, setOpen] = useState(record.status !== "NOT_STARTED");
  const [form, setForm] = useState({ category: record.category, status: record.status, summary: record.summary ?? "", methodology: record.methodology ?? "", sampleDescription: record.sampleDescription ?? "", findings: record.findings ?? "", limitations: record.limitations ?? "" });
  useEffect(() => setForm({ category: record.category, status: record.status, summary: record.summary ?? "", methodology: record.methodology ?? "", sampleDescription: record.sampleDescription ?? "", findings: record.findings ?? "", limitations: record.limitations ?? "" }), [record]);
  return <section className="rounded-xl border border-uq bg-uq-elev1 shadow-uq-glass"><button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 p-4 text-left"><span><span className="font-semibold text-uq">{EVIDENCE_LABELS[record.category] ?? record.category}</span><span className="ml-2 font-mono text-[10px] uppercase tracking-[0.1em] text-uq-3">{record.status.replaceAll("_", " ")}</span></span><span className="text-uq-3">{open ? "−" : "+"}</span></button>{open && <div className="border-t border-uq-faint p-4"><div className="grid gap-4"><label className="text-sm font-medium text-uq">Evidence status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="mt-1 block w-full rounded-lg border border-uq bg-uq-elev2 px-3 py-2 text-sm text-uq">{["NOT_STARTED", "PLANNED", "IN_PROGRESS", "EVIDENCE_AVAILABLE", "INSUFFICIENT", "NOT_APPLICABLE"].map((status) => <option key={status}>{status}</option>)}</select></label><TextField label="Summary and controlled-document references" value={form.summary} onChange={(summary) => setForm({ ...form, summary })} /><TextField label="Methodology" value={form.methodology} onChange={(methodology) => setForm({ ...form, methodology })} rows={4} /><TextField label="Sample and setting" value={form.sampleDescription} onChange={(sampleDescription) => setForm({ ...form, sampleDescription })} /><TextField label="Findings" value={form.findings} onChange={(findings) => setForm({ ...form, findings })} rows={4} /><TextField label="Limitations and contrary evidence" value={form.limitations} onChange={(limitations) => setForm({ ...form, limitations })} rows={4} /></div><button disabled={busy} onClick={() => void onSave(form)} className="mt-4 rounded-lg bg-uq-accent px-4 py-2 text-sm font-medium text-[color:var(--uq-text-on-accent)] disabled:opacity-50">Save evidence record</button></div>}</section>;
}

function ReviewSection({ programme, busy, onSave }: { programme: Programme; busy: boolean; onSave: (payload: Record<string, string>) => Promise<unknown> }) {
  const [form, setForm] = useState({ conclusion: programme.conclusion, independentReviewerName: programme.independentReviewerName ?? "", independentReviewerCredentials: programme.independentReviewerCredentials ?? "", limitations: programme.limitations ?? "" });
  return <section className="rounded-xl border border-uq bg-uq-elev1 p-5 shadow-uq-glass"><h3 className="font-semibold text-uq">Independent evidence review</h3><p className="mt-1 text-xs leading-relaxed text-uq-3">This is an attributed professional judgement about the stated use—not a universal “validated” badge. Positive conclusions are blocked until every evidence domain is recorded as available.</p><div className="mt-4 grid gap-4"><label className="text-sm font-medium text-uq">Conclusion<select value={form.conclusion} onChange={(event) => setForm({ ...form, conclusion: event.target.value })} className="mt-1 block w-full rounded-lg border border-uq bg-uq-elev2 px-3 py-2 text-sm text-uq">{["NOT_EVALUATED", "INSUFFICIENT_EVIDENCE", "SUPPORTS_INTENDED_USE", "SUPPORTS_WITH_LIMITATIONS", "DOES_NOT_SUPPORT_INTENDED_USE"].map((value) => <option key={value}>{value}</option>)}</select></label><Field label="Independent reviewer" value={form.independentReviewerName} onChange={(independentReviewerName) => setForm({ ...form, independentReviewerName })} /><TextField label="Credentials and independence statement" value={form.independentReviewerCredentials} onChange={(independentReviewerCredentials) => setForm({ ...form, independentReviewerCredentials })} /><TextField label="Limitations, conditions and revalidation triggers" value={form.limitations} onChange={(limitations) => setForm({ ...form, limitations })} rows={5} /></div><button disabled={busy} onClick={() => void onSave(form)} className="mt-4 rounded-lg bg-uq-accent px-4 py-2 text-sm font-medium text-[color:var(--uq-text-on-accent)] disabled:opacity-50">Record attributed review</button>{programme.reviewedAt && <p className="mt-3 font-mono text-[10px] text-uq-3">Last reviewed {new Date(programme.reviewedAt).toLocaleString()}</p>}</section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-uq-faint bg-uq-elev2 p-3"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-uq-3">{label}</div><div className="mt-1 text-sm font-medium capitalize text-uq">{value.toLowerCase()}</div></div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm font-medium text-uq">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-lg border border-uq bg-uq-elev2 px-3 py-2 text-sm text-uq focus:border-uq-accent focus:outline-none" /></label>; }
function TextField({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) { return <label className="text-sm font-medium text-uq">{label}<textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-lg border border-uq bg-uq-elev2 px-3 py-2 text-sm leading-relaxed text-uq focus:border-uq-accent focus:outline-none" /></label>; }
function programmePath(scenarioId: string, programmeId: string) { return `/api/admin/recruitment/scenarios/${scenarioId}/psychometrics/${programmeId}`; }
function jsonPatch(body: unknown): RequestInit { return { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }; }
