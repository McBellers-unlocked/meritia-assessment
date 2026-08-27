"use client";

import type { AssessmentMode } from "@/lib/recruit/assessment-modes";
import {
  ROLE_EVIDENCE_AI_CONDITIONS,
  ROLE_EVIDENCE_CONSEQUENCES,
  ROLE_EVIDENCE_DISCLAIMER,
  ROLE_EVIDENCE_ENTRY_REQUIREMENTS,
  ROLE_EVIDENCE_IMPORTANCE,
  ROLE_EVIDENCE_LABELS,
  ROLE_EVIDENCE_OBSERVABILITY,
  roleEvidenceReadiness,
  roleEvidenceWarnings,
  type RoleEvidenceReview,
  type RoleEvidenceSourceKind,
} from "@/lib/recruit/role-evidence";

const SOURCE_LABELS: Record<RoleEvidenceSourceKind, string> = {
  UPLOADED_JD: "Uploaded job description",
  WIPO: "WIPO careers posting",
  ITU: "ITU careers posting",
};

export default function RoleEvidenceReviewStep({
  reviews,
  onChange,
  sourceKind,
  sourceLabel,
  sourceLink,
  assessmentMode,
  reviewerName,
  onBack,
  onContinue,
}: {
  reviews: RoleEvidenceReview[];
  onChange: (reviews: RoleEvidenceReview[]) => void;
  sourceKind: RoleEvidenceSourceKind;
  sourceLabel: string;
  sourceLink: string | null;
  assessmentMode: AssessmentMode;
  reviewerName: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  const readiness = roleEvidenceReadiness(reviews);
  const kept = reviews.filter((review) => review.decision === "KEEP").length;
  const confirmed = reviews.filter((review) => review.confirmed).length;

  const update = (
    index: number,
    patch: Partial<RoleEvidenceReview>,
    preserveConfirmation = false,
  ) => {
    onChange(reviews.map((review, itemIndex) => itemIndex === index
      ? { ...review, ...patch, confirmed: preserveConfirmation ? (patch.confirmed ?? review.confirmed) : false }
      : review));
  };

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-uq bg-uq-elev1 p-5 shadow-uq-glass">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-uq-accent">Role Evidence Review</div>
            <h2 className="mt-1 text-lg font-semibold text-uq">Confirm what is genuinely appropriate to assess</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-uq-2">
              AI has proposed a starting point from the role document. Confirm whether each requirement is needed at entry,
              important, observable and suitable for the chosen AI condition before tasks are generated.
            </p>
          </div>
          <div className="rounded-lg border border-uq bg-uq-elev2 px-3 py-2 text-right text-xs text-uq-2">
            <div><span className="font-mono tabular-nums text-uq">{confirmed}/{reviews.length}</span> confirmed</div>
            <div><span className="font-mono tabular-nums text-uq">{kept}</span> retained</div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-uq-faint bg-uq-elev2 p-3 text-xs leading-relaxed text-uq-2">
          <div className="font-medium text-uq">{SOURCE_LABELS[sourceKind]}</div>
          <div className="mt-0.5">
            <span className="font-mono">{sourceLabel || "Job description"}</span>
            {sourceLink && <>{" · "}<a href={sourceLink.replace(/^http:\/\//i, "https://")} target="_blank" rel="noopener noreferrer" className="text-uq-accent hover:underline">↗ original posting</a></>}
          </div>
          <div className="mt-2">Reviewer: <span className="font-medium text-uq">{reviewerName}</span></div>
        </div>

        <div className="mt-3 rounded-lg border border-[color:var(--uq-warn-line)] bg-[color:var(--uq-warn-soft)] px-3 py-2 text-xs leading-relaxed text-[color:var(--uq-warn-text)]">
          {ROLE_EVIDENCE_DISCLAIMER}
        </div>
      </header>

      {reviews.map((review, index) => {
        const warnings = roleEvidenceWarnings(review, assessmentMode);
        return (
          <article key={review.reviewId} className={`rounded-xl border bg-uq-elev1 p-5 shadow-uq-glass ${review.decision === "EXCLUDE" ? "border-uq-faint opacity-80" : "border-uq"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-uq-3">Criterion {index + 1}</span>
                  <span className="rounded-full border border-uq-faint bg-uq-elev2 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-uq-3">{review.origin.toLowerCase()}</span>
                  {review.confirmed && <span className="rounded-full border border-[color:var(--uq-success-line)] bg-[color:var(--uq-success-soft)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--uq-success-text)]">Confirmed</span>}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-uq-3">Source requirement: {review.sourceRequirement}</p>
              </div>
              <div className="inline-flex rounded-lg border border-uq p-1">
                {(["KEEP", "EXCLUDE"] as const).map((decision) => (
                  <button key={decision} type="button" onClick={() => update(index, { decision })} className={`rounded-md px-3 py-1 text-xs font-medium ${review.decision === decision ? decision === "KEEP" ? "bg-uq-accent text-[color:var(--uq-text-on-accent)]" : "bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]" : "text-uq-3 hover:text-uq"}`}>
                    {ROLE_EVIDENCE_LABELS.decision[decision]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SelectField label="Required at entry?" value={review.entryRequirement} options={ROLE_EVIDENCE_ENTRY_REQUIREMENTS} labels={ROLE_EVIDENCE_LABELS.entryRequirement} onChange={(value) => update(index, { entryRequirement: value })} />
              <SelectField label="Job importance" value={review.importance} options={ROLE_EVIDENCE_IMPORTANCE} labels={ROLE_EVIDENCE_LABELS.importance} onChange={(value) => update(index, { importance: value })} />
              <SelectField label="Weak-performance consequence" value={review.consequence} options={ROLE_EVIDENCE_CONSEQUENCES} labels={ROLE_EVIDENCE_LABELS.consequence} onChange={(value) => update(index, { consequence: value })} />
              <SelectField label="Observable here?" value={review.observability} options={ROLE_EVIDENCE_OBSERVABILITY} labels={ROLE_EVIDENCE_LABELS.observability} onChange={(value) => update(index, { observability: value })} />
              <SelectField label="Expected AI condition" value={review.aiCondition} options={ROLE_EVIDENCE_AI_CONDITIONS} labels={ROLE_EVIDENCE_LABELS.aiCondition} onChange={(value) => update(index, { aiCondition: value })} />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <label className="text-xs text-uq-2 lg:col-span-2">
                Clear criterion used in the assessment
                <textarea value={review.criterion} onChange={(event) => update(index, { criterion: event.target.value })} rows={2} className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq focus:border-uq-accent focus:outline-none" />
              </label>
              <label className="text-xs text-uq-2">
                Observable behaviours <span className="text-uq-3">(one per line)</span>
                <textarea value={review.observableBehaviours.join("\n")} onChange={(event) => update(index, { observableBehaviours: event.target.value.split("\n") })} rows={5} className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq focus:border-uq-accent focus:outline-none" />
              </label>
              <label className="text-xs text-uq-2">
                Expected candidate evidence
                <textarea value={review.expectedCandidateEvidence} onChange={(event) => update(index, { expectedCandidateEvidence: event.target.value })} rows={5} className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq focus:border-uq-accent focus:outline-none" />
              </label>
              <label className="text-xs text-uq-2 lg:col-span-2">
                Reviewer rationale
                <textarea value={review.reviewerRationale} onChange={(event) => update(index, { reviewerRationale: event.target.value })} rows={3} className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq focus:border-uq-accent focus:outline-none" />
              </label>
            </div>

            {warnings.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-lg border border-uq-faint bg-uq-elev2 px-3 py-2 text-xs leading-relaxed text-uq-2">
                {warnings.map((warning) => <li key={warning.message}><span className="font-medium text-uq">{warning.severity === "warning" ? "Review:" : "Note:"}</span> {warning.message}</li>)}
              </ul>
            )}

            <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-uq-faint bg-uq-elev2 p-3 text-xs leading-relaxed text-uq-2">
              <input type="checkbox" checked={review.confirmed} onChange={(event) => update(index, { confirmed: event.target.checked }, true)} className="mt-0.5 h-4 w-4 accent-[color:var(--uq-accent)]" />
              <span>I confirm this decision and rationale as the accountable reviewer. The proposals above have been checked rather than accepted solely because AI suggested them.</span>
            </label>
          </article>
        );
      })}

      {!readiness.ready && (
        <div className="rounded-lg border border-uq-strong bg-uq-elev2 px-4 py-3 text-xs text-uq-2">
          <div className="font-medium text-uq">Complete the review before generating tasks</div>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {readiness.blockers.slice(0, 5).map((blocker) => <li key={blocker}>{blocker}</li>)}
            {readiness.blockers.length > 5 && <li>{readiness.blockers.length - 5} more item(s)</li>}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={onBack} className="text-sm text-uq-2 hover:text-uq">← Back</button>
        <button type="button" onClick={onContinue} disabled={!readiness.ready} className="rounded-lg bg-uq-accent px-4 py-2 text-sm font-medium text-[color:var(--uq-text-on-accent)] shadow-uq-glow-soft disabled:cursor-not-allowed disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none">
          Generate tasks from reviewed evidence
        </button>
      </div>
    </section>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="text-xs text-uq-2">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value as T)} className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-2 py-2 text-xs text-uq focus:border-uq-accent focus:outline-none">
        {options.map((option) => <option key={option} value={option}>{labels[option]}</option>)}
      </select>
    </label>
  );
}
