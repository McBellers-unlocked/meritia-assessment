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
    <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
      <label className="block text-sm">
        <span className="text-slate-600">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-sm">
        <span className="text-slate-600">URL slug</span>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          disabled={slugLocked}
          className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono disabled:bg-slate-50 disabled:text-slate-500"
        />
        {slugLocked ? (
          <span className="text-xs text-amber-700 mt-1 block">
            Locked — this scenario is assigned to an active assessment. Archive the assessment to release the slug.
          </span>
        ) : (
          <span className="text-xs text-slate-500 mt-1 block">
            Candidate URL: <code className="bg-slate-100 px-1 rounded">/assess/{slug}</code>
          </span>
        )}
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-slate-600">Organisation</span>
          <input
            value={organisation}
            onChange={(e) => setOrganisation(e.target.value)}
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Position title</span>
          <input
            value={positionTitle}
            onChange={(e) => setPositionTitle(e.target.value)}
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Default total minutes</span>
          <input
            type="number"
            min={5}
            max={480}
            value={defaultTotalMinutes}
            onChange={(e) => setDefaultTotalMinutes(e.target.value)}
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">{error}</div>}

      <div className="flex items-center justify-end gap-3 pt-2">
        {savedAt && <span className="text-xs text-slate-500">Saved {savedAt.toLocaleTimeString()}</span>}
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338] disabled:bg-slate-300"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
