import { getAssessmentModePolicy, type AssessmentMode } from "@/lib/recruit/assessment-modes";

export function AssessmentModeBadge({ mode, className = "" }: { mode?: AssessmentMode | string | null; className?: string }) {
  const policy = getAssessmentModePolicy(mode);
  return (
    <span className={`inline-flex items-center rounded-full border border-uq-strong bg-uq-elev2 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-uq-2 ${className}`}>
      {policy.label}
    </span>
  );
}

export function AssessmentModeDisclosure({ mode }: { mode?: AssessmentMode | string | null }) {
  const policy = getAssessmentModePolicy(mode);
  return (
    <section className="rounded-xl border border-uq-strong bg-uq-elev2 p-4" aria-labelledby="assessment-mode-heading">
      <div className="flex flex-wrap items-center gap-2">
        <AssessmentModeBadge mode={policy.mode} />
        <h2 id="assessment-mode-heading" className="text-sm font-semibold text-uq">Declared AI-use policy</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-uq-2">{policy.candidateInstructions}</p>
    </section>
  );
}
