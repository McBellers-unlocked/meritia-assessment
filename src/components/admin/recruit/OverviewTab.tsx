"use client";

import { useEffect, useState } from "react";
import type { EditorScenario } from "./scenarioEditorTypes";
import { ASSESSMENT_MODES, getAssessmentModePolicy, type AssessmentMode } from "@/lib/recruit/assessment-modes";

/**
 * Overview tab: edit scenario header fields (title, slug, organisation,
 * positionTitle, defaultTotalMinutes). Slug changes are blocked once the
 * scenario is in use by an active cohort — the API enforces that; we also
 * grey out the field client-side so the admin doesn't type pointlessly.
 */
export default function OverviewTab({
  scenario,
  onSaved,
}: {
  scenario: EditorScenario;
  onSaved: (next: EditorScenario) => void;
}) {
  const [title, setTitle] = useState(scenario.title);
  const [slug, setSlug] = useState(scenario.slug);
  const [organisation, setOrganisation] = useState(scenario.organisation);
  const [positionTitle, setPositionTitle] = useState(scenario.positionTitle);
  const [defaultTotalMinutes, setDefaultTotalMinutes] = useState(String(scenario.defaultTotalMinutes));
  const [assessmentMode, setAssessmentMode] = useState<AssessmentMode>(scenario.assessmentMode || "EVIDENCE");
  const [defenceEnabled, setDefenceEnabled] = useState(Boolean(scenario.defenceEnabled));
  const [defenceMinutes, setDefenceMinutes] = useState(String(scenario.defenceMinutes || 5));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Reset form when scenario changes (e.g. after publish).
  useEffect(() => {
    setTitle(scenario.title);
    setSlug(scenario.slug);
    setOrganisation(scenario.organisation);
    setPositionTitle(scenario.positionTitle);
    setDefaultTotalMinutes(String(scenario.defaultTotalMinutes));
    setAssessmentMode(scenario.assessmentMode || "EVIDENCE");
    setDefenceEnabled(Boolean(scenario.defenceEnabled));
    setDefenceMinutes(String(scenario.defenceMinutes || 5));
  }, [scenario.id, scenario.title, scenario.slug, scenario.organisation, scenario.positionTitle, scenario.defaultTotalMinutes, scenario.assessmentMode, scenario.defenceEnabled, scenario.defenceMinutes]);

  const slugLocked = scenario._count.assessments > 0 && scenario.status === "published";

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/recruitment/scenarios/${scenario.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim().toLowerCase(),
          organisation: organisation.trim(),
          positionTitle: positionTitle.trim(),
          defaultTotalMinutes: Number(defaultTotalMinutes) || 90,
          assessmentMode,
          defenceEnabled,
          defenceQuestionCount: 2,
          defenceMinutes: Number(defenceMinutes) || 5,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      onSaved({ ...scenario, ...body.scenario });
      setSavedAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-uq bg-uq-elev1 shadow-uq-glass p-5 space-y-4">
      <label className="block text-sm">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
        />
      </label>

      <label className="block text-sm">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">URL slug</span>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          disabled={slugLocked}
          className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm font-mono text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1 disabled:bg-uq-elev2 disabled:text-uq-3"
        />
        {slugLocked ? (
          <span className="text-xs text-[color:var(--uq-warn-text)] mt-1 block">
            Locked — this scenario is assigned to an active assessment. Archive the assessment to release the slug.
          </span>
        ) : (
          <span className="text-xs text-uq-3 mt-1 block">
            Candidate URL: <code className="font-mono bg-uq-elev2 border border-uq-faint text-uq px-1 rounded">/assess/{slug}</code>
          </span>
        )}
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Organisation</span>
          <input
            value={organisation}
            onChange={(e) => setOrganisation(e.target.value)}
            className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Position title</span>
          <input
            value={positionTitle}
            onChange={(e) => setPositionTitle(e.target.value)}
            className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Default total minutes</span>
          <input
            type="number"
            min={5}
            max={480}
            value={defaultTotalMinutes}
            onChange={(e) => setDefaultTotalMinutes(e.target.value)}
            className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
          />
        </label>
      </div>

      <fieldset className="border-t border-uq pt-4">
        <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Assessment mode</legend>
        <p className="mt-1 text-xs leading-relaxed text-uq-3">Choose the policy that matches the construct being assessed. No mode is inherently more rigorous.</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {ASSESSMENT_MODES.map((mode) => {
            const policy = getAssessmentModePolicy(mode);
            const selected = assessmentMode === mode;
            return (
              <label key={mode} className={`cursor-pointer rounded-xl border p-3 transition-colors ${selected ? "border-uq-accent bg-uq-accent-soft" : "border-uq bg-uq-glass-subtle hover:border-uq-strong"}`}>
                <span className="flex items-start gap-2">
                  <input type="radio" name="assessmentMode" value={mode} checked={selected} onChange={() => { setAssessmentMode(mode); if (mode === "OPEN_AGENT") setDefenceEnabled(true); }} className="mt-1 accent-[color:var(--uq-accent)]" />
                  <span>
                    <span className="block text-sm font-semibold text-uq">{policy.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-uq-2">{policy.purpose}</span>
                  </span>
                </span>
                <dl className="mt-3 space-y-1 text-[11px] text-uq-3">
                  <div><dt className="inline font-medium text-uq-2">External AI: </dt><dd className="inline">{policy.externalAiPermitted ? "permitted" : "not permitted"}</dd></div>
                  <div><dt className="inline font-medium text-uq-2">Drafting: </dt><dd className="inline">{policy.knowledgeSystemDraftingPermitted ? "permitted and labelled" : "not permitted"}</dd></div>
                  <div><dt className="inline font-medium text-uq-2">Defence: </dt><dd className="inline">{policy.defenceDefaultEnabled ? "normally enabled" : "configurable"}</dd></div>
                </dl>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="border-t border-uq pt-4">
        <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Written reasoning defence</legend>
        <label className="mt-2 flex items-start gap-2 text-sm text-uq-2">
          <input type="checkbox" checked={defenceEnabled} onChange={(event) => setDefenceEnabled(event.target.checked)} className="mt-0.5 accent-[color:var(--uq-accent)]" />
          <span>Lock the main work, then ask exactly two human-reviewed reasoning questions.</span>
        </label>
        {defenceEnabled && (
          <label className="mt-3 block max-w-xs text-sm">
            <span className="text-uq-2">Additional defence minutes</span>
            <input type="number" min={1} max={30} value={defenceMinutes} onChange={(event) => setDefenceMinutes(event.target.value)} className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 font-mono text-sm text-uq" />
          </label>
        )}
      </fieldset>

      {error && <div className="rounded-md px-3 py-2 text-sm border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">{error}</div>}

      <div className="flex items-center justify-end gap-3 pt-2">
        {savedAt && <span className="text-xs text-uq-3">Saved {savedAt.toLocaleTimeString()}</span>}
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
