"use client";

import { useEffect, useState } from "react";
import type { EditorScenario } from "./scenarioEditorTypes";

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
  }, [scenario.id, scenario.title, scenario.slug, scenario.organisation, scenario.positionTitle, scenario.defaultTotalMinutes]);

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
    <div className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass p-5 space-y-4">
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
            Candidate URL: <code className="font-mono bg-uq-glass-subtle border border-uq-faint text-uq-cyan px-1 rounded">/assess/{slug}</code>
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
