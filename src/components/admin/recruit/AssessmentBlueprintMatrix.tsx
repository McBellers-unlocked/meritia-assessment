"use client";

import { useState } from "react";
import type { EditorScenario } from "./scenarioEditorTypes";
import {
  ROLE_EVIDENCE_DISCLAIMER,
  ROLE_EVIDENCE_LABELS,
  normaliseRoleEvidenceReview,
  roleEvidenceWarnings,
} from "@/lib/recruit/role-evidence";

type Criterion = NonNullable<EditorScenario["criteria"]>[number];
type MappingForm = { taskId: string; evidence: string; rubricIds: string; marks: string };
type CriterionForm = {
  id: string | null;
  code: string;
  name: string;
  description: string;
  sourceRequirement: string;
  behaviours: string;
  mappings: MappingForm[];
};

function blankForm(scenario: EditorScenario): CriterionForm {
  return {
    id: null,
    code: "",
    name: "",
    description: "",
    sourceRequirement: "",
    behaviours: "",
    mappings: scenario.tasks[0]
      ? [{ taskId: scenario.tasks[0].id, evidence: "", rubricIds: "", marks: "0" }]
      : [],
  };
}

function formForCriterion(criterion: Criterion): CriterionForm {
  return {
    id: criterion.id,
    code: criterion.code,
    name: criterion.name,
    description: criterion.description,
    sourceRequirement: criterion.sourceRequirement ?? "",
    behaviours: criterion.observableBehaviours.join("\n"),
    mappings: criterion.taskMappings.map((mapping) => ({
      taskId: mapping.taskId,
      evidence: mapping.expectedCandidateEvidence,
      rubricIds: mapping.rubricElementIds.join(", "),
      marks: String(mapping.marks),
    })),
  };
}

export default function AssessmentBlueprintMatrix({
  scenario,
  criteria,
  onChanged,
}: {
  scenario: EditorScenario;
  criteria: NonNullable<EditorScenario["criteria"]>;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CriterionForm>(() => blankForm(scenario));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mappedTaskIds = new Set(criteria.flatMap((criterion) => criterion.taskMappings.map((mapping) => mapping.taskId)));
  const unmappedTasks = scenario.tasks.filter((task) => !mappedTaskIds.has(task.id));
  const markMismatches = scenario.tasks.flatMap((task) => {
    const mappedMarks = criteria.reduce(
      (total, criterion) => total + criterion.taskMappings
        .filter((mapping) => mapping.taskId === task.id)
        .reduce((sum, mapping) => sum + mapping.marks, 0),
      0
    );
    return mappedMarks === task.totalMarks ? [] : [`Task ${task.number}: ${mappedMarks}/${task.totalMarks} mapped marks`];
  });
  const evidenceCounts = new Map<string, number>();
  for (const mapping of criteria.flatMap((criterion) => criterion.taskMappings)) {
    const key = mapping.expectedCandidateEvidence.trim().toLowerCase().replace(/\s+/g, " ");
    if (key) evidenceCounts.set(key, (evidenceCounts.get(key) ?? 0) + 1);
  }
  const duplicateEvidenceCount = Array.from(evidenceCounts.values()).filter((count) => count > 1).length;
  const styleOnlyCriteria = criteria.filter((criterion) => {
    const ids = criterion.taskMappings.flatMap((mapping) => mapping.rubricElementIds);
    return ids.length > 0 && ids.every((id) => /(style|grammar|presentation|communication)/i.test(id));
  });
  const parsedRoleEvidence = new Map(criteria.map((criterion) => [
    criterion.id,
    normaliseRoleEvidenceReview(criterion.roleEvidence),
  ]));
  const roleEvidenceGaps = criteria.flatMap((criterion) => {
    const review = parsedRoleEvidence.get(criterion.id);
    if (!review) return [`${criterion.code} has no confirmed Role Evidence Review.`];
    return roleEvidenceWarnings(review, scenario.assessmentMode).map((warning) => `${criterion.code}: ${warning.message}`);
  });
  const blueprintGaps = [
    ...unmappedTasks.map((task) => `Task ${task.number} has no declared criterion.`),
    ...markMismatches,
    ...(duplicateEvidenceCount ? [`${duplicateEvidenceCount} expected-evidence statement${duplicateEvidenceCount === 1 ? " is" : "s are"} mapped more than once; check for double reward.`] : []),
    ...styleOnlyCriteria.map((criterion) => `${criterion.code} is mapped only to style/communication rubric elements; confirm the underlying construct is observable.`),
    ...roleEvidenceGaps,
  ];
  const evidenceRecord = scenario.roleEvidenceRecord && typeof scenario.roleEvidenceRecord === "object"
    ? scenario.roleEvidenceRecord
    : null;
  const reviewedBy = evidenceRecord?.reviewedBy && typeof evidenceRecord.reviewedBy === "object"
    ? evidenceRecord.reviewedBy as Record<string, unknown>
    : null;
  const evidenceSource = String(evidenceRecord?.sourceKind ?? "").replaceAll("_", " ");

  const beginNew = () => {
    setForm(blankForm(scenario));
    setError(null);
    setOpen(true);
  };

  const beginEdit = (criterion: Criterion) => {
    setForm(formForCriterion(criterion));
    setError(null);
    setOpen(true);
  };

  const updateMapping = (index: number, update: Partial<MappingForm>) => {
    setForm((current) => ({
      ...current,
      mappings: current.mappings.map((mapping, mappingIndex) =>
        mappingIndex === index ? { ...mapping, ...update } : mapping
      ),
    }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/recruitment/scenarios/${scenario.id}/criteria`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          code: form.code,
          name: form.name,
          description: form.description,
          sourceRequirement: form.sourceRequirement,
          observableBehaviours: form.behaviours.split("\n").map((value) => value.trim()).filter(Boolean),
          mappings: form.mappings.map((mapping) => ({
            taskId: mapping.taskId,
            expectedCandidateEvidence: mapping.evidence,
            rubricElementIds: mapping.rubricIds.split(",").map((value) => value.trim()).filter(Boolean),
            marks: Number(mapping.marks) || 0,
          })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not save criterion");
      setOpen(false);
      setForm(blankForm(scenario));
      onChanged();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (criterion: Criterion) => {
    if (!window.confirm(`Delete ${criterion.code} — ${criterion.name} and its blueprint mappings?`)) return;
    setError(null);
    const response = await fetch(`/api/admin/recruitment/scenarios/${scenario.id}/criteria`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ criterionId: criterion.id }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setError(body.error || "Could not delete criterion");
    if (form.id === criterion.id) setOpen(false);
    onChanged();
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-uq">Assessment Blueprint</h3>
          <p className="text-xs text-uq-3">Requirement → criterion → observable behaviour → task → candidate evidence → rubric element.</p>
        </div>
        <button type="button" onClick={open ? () => setOpen(false) : beginNew} className="rounded-lg border border-uq-strong px-3 py-1.5 text-xs text-uq-2">
          {open ? "Close" : "Add criterion"}
        </button>
      </div>

      <div className={`mt-4 rounded-xl border p-4 ${evidenceRecord ? "border-[color:var(--uq-success-line)] bg-[color:var(--uq-success-soft)]" : "border-[color:var(--uq-warn-line)] bg-[color:var(--uq-warn-soft)]"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-uq-3">Role Evidence Record</div>
            <div className="mt-1 text-sm font-semibold text-uq">{evidenceRecord ? "Human review recorded" : "Review not recorded"}</div>
            {evidenceRecord && <div className="mt-1 text-xs text-uq-2">{evidenceSource || "JOB DESCRIPTION"} · {String(evidenceRecord.sourceLabel ?? "Job description")} · {String(reviewedBy?.name ?? "Reviewer")}{scenario.roleEvidenceReviewedAt ? ` · ${new Date(scenario.roleEvidenceReviewedAt).toLocaleString()}` : ""}</div>}
          </div>
          {evidenceRecord && <span className="rounded-full border border-[color:var(--uq-success-line)] bg-uq-elev1 px-2.5 py-1 text-xs font-medium text-[color:var(--uq-success-text)]">{criteria.length} retained criteria</span>}
        </div>
        <p className="mt-2 max-w-4xl text-xs leading-relaxed text-uq-2">{ROLE_EVIDENCE_DISCLAIMER}</p>
      </div>

      {open && (
        <div className="mt-4 space-y-4 rounded-xl border border-uq bg-uq-elev2 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-uq-2">Stable code<input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="CRIT-01" className="mt-1 block w-full rounded-md border border-uq bg-uq-elev1 px-3 py-2 text-sm" /></label>
            <label className="text-xs text-uq-2">Criterion name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 block w-full rounded-md border border-uq bg-uq-elev1 px-3 py-2 text-sm" /></label>
            <label className="text-xs text-uq-2 sm:col-span-2">Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} className="mt-1 block w-full rounded-md border border-uq bg-uq-elev1 px-3 py-2 text-sm" /></label>
            <label className="text-xs text-uq-2 sm:col-span-2">Source requirement<textarea value={form.sourceRequirement} onChange={(event) => setForm({ ...form, sourceRequirement: event.target.value })} rows={2} className="mt-1 block w-full rounded-md border border-uq bg-uq-elev1 px-3 py-2 text-sm" /></label>
            <label className="text-xs text-uq-2 sm:col-span-2">Observable behaviours (one per line)<textarea value={form.behaviours} onChange={(event) => setForm({ ...form, behaviours: event.target.value })} rows={3} className="mt-1 block w-full rounded-md border border-uq bg-uq-elev1 px-3 py-2 text-sm" /></label>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-uq">Task mappings</h4>
              <button type="button" onClick={() => setForm((current) => ({ ...current, mappings: [...current.mappings, { taskId: "", evidence: "", rubricIds: "", marks: "0" }] }))} className="text-xs text-uq-accent hover:underline">Add mapping</button>
            </div>
            {form.mappings.length === 0 && <p className="mt-2 text-xs text-uq-3">No mapping yet. Validation will flag this criterion as a publication blocker.</p>}
            <div className="mt-2 space-y-3">
              {form.mappings.map((mapping, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-uq-faint bg-uq-elev1 p-3 sm:grid-cols-2">
                  <label className="text-xs text-uq-2">Task<select value={mapping.taskId} onChange={(event) => updateMapping(index, { taskId: event.target.value })} className="mt-1 block w-full rounded-md border border-uq bg-uq-elev1 px-3 py-2 text-sm"><option value="">Select task</option>{scenario.tasks.map((task) => <option key={task.id} value={task.id}>Task {task.number} — {task.title}</option>)}</select></label>
                  <label className="text-xs text-uq-2">Mapped marks<input value={mapping.marks} onChange={(event) => updateMapping(index, { marks: event.target.value })} type="number" min="0" className="mt-1 block w-full rounded-md border border-uq bg-uq-elev1 px-3 py-2 text-sm" /></label>
                  <label className="text-xs text-uq-2 sm:col-span-2">Expected candidate evidence<textarea value={mapping.evidence} onChange={(event) => updateMapping(index, { evidence: event.target.value })} rows={2} className="mt-1 block w-full rounded-md border border-uq bg-uq-elev1 px-3 py-2 text-sm" /></label>
                  <label className="text-xs text-uq-2">Rubric element IDs<input value={mapping.rubricIds} onChange={(event) => updateMapping(index, { rubricIds: event.target.value })} placeholder="diagnostic_acuity, inquiry_quality" className="mt-1 block w-full rounded-md border border-uq bg-uq-elev1 px-3 py-2 text-sm" /></label>
                  <div className="flex items-end justify-end"><button type="button" onClick={() => setForm((current) => ({ ...current, mappings: current.mappings.filter((_, mappingIndex) => mappingIndex !== index) }))} className="text-xs text-[color:var(--uq-danger-text)] hover:underline">Remove mapping</button></div>
                </div>
              ))}
            </div>
          </div>

          {error && <p role="alert" className="text-xs text-[color:var(--uq-danger-text)]">{error}</p>}
          <div className="flex justify-end"><button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-uq-accent px-4 py-2 text-sm text-[color:var(--uq-text-on-accent)] disabled:opacity-50">{saving ? "Saving…" : form.id ? "Update criterion" : "Save criterion"}</button></div>
        </div>
      )}

      {error && !open && <p role="alert" className="mt-3 text-xs text-[color:var(--uq-danger-text)]">{error}</p>}
      {blueprintGaps.length > 0 && (
        <div className="mt-4 rounded-xl border border-uq-strong bg-uq-elev2 p-3">
          <div className="text-xs font-medium text-uq">Blueprint gaps to review</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-uq-2">
            {blueprintGaps.map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
        </div>
      )}
      <div className="mt-4 overflow-x-auto rounded-xl border border-uq">
        <table className="min-w-full text-xs">
          <thead className="bg-uq-elev2 font-mono uppercase tracking-[0.1em] text-uq-3"><tr>{["Criterion", "Observable behaviour", "Task", "Candidate evidence", "Rubric element", "Marks", "Actions"].map((value) => <th key={value} className="px-3 py-2 text-left">{value}</th>)}</tr></thead>
          <tbody>
            {criteria.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-uq-3">No stable criteria yet. Publication will remain blocked.</td></tr>}
            {criteria.flatMap((criterion) => {
              const mappings = criterion.taskMappings.length ? criterion.taskMappings : [null];
              const roleEvidence = parsedRoleEvidence.get(criterion.id);
              return mappings.map((mapping, index) => (
                <tr key={mapping?.id ?? criterion.id} className="border-t border-uq-faint">
                  <td className="px-3 py-2 align-top"><span className="font-mono text-uq-3">{criterion.code}</span><div className="font-medium text-uq">{criterion.name}</div>{index === 0 && criterion.sourceRequirement && <div className="mt-1 max-w-xs text-uq-3">{criterion.sourceRequirement}</div>}{index === 0 && roleEvidence && <div className="mt-2 flex max-w-xs flex-wrap gap-1"><RoleEvidenceBadge label={ROLE_EVIDENCE_LABELS.importance[roleEvidence.importance]} /><RoleEvidenceBadge label={ROLE_EVIDENCE_LABELS.entryRequirement[roleEvidence.entryRequirement]} /><RoleEvidenceBadge label={`${ROLE_EVIDENCE_LABELS.observability[roleEvidence.observability]} observable`} /><RoleEvidenceBadge label={ROLE_EVIDENCE_LABELS.aiCondition[roleEvidence.aiCondition]} /></div>}</td>
                  <td className="px-3 py-2 align-top text-uq-2">{criterion.observableBehaviours.join("; ") || <span className="text-uq-3">Gap: not declared</span>}</td>
                  <td className="px-3 py-2 align-top">{mapping ? `Task ${mapping.task.number} — ${mapping.task.title}` : <span className="text-uq-3">Gap: no task mapping</span>}</td>
                  <td className="px-3 py-2 align-top text-uq-2">{mapping?.expectedCandidateEvidence || <span className="text-uq-3">Gap</span>}</td>
                  <td className="px-3 py-2 align-top font-mono text-uq-2">{mapping?.rubricElementIds.join(", ") || "Gap"}</td>
                  <td className="px-3 py-2 align-top font-mono">{mapping?.marks ?? 0}</td>
                  <td className="px-3 py-2 align-top"><div className="flex gap-2"><button type="button" onClick={() => beginEdit(criterion)} className="text-uq-accent hover:underline">Edit</button><button type="button" onClick={() => void remove(criterion)} className="text-[color:var(--uq-danger-text)] hover:underline">Delete</button></div></td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RoleEvidenceBadge({ label }: { label: string }) {
  return <span className="rounded-full border border-uq-faint bg-uq-elev2 px-2 py-0.5 text-[10px] text-uq-2">{label}</span>;
}
