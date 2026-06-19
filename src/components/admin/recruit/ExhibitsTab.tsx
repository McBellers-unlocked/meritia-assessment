"use client";

import { useState } from "react";
import type { EditorScenario, EditorExhibit } from "./scenarioEditorTypes";

/**
 * Exhibits tab: manage the scenario's exhibit library. Each exhibit is a
 * title + HTML blob that memo_ai tasks reference by id. We render the HTML
 * in a sandboxed iframe for preview so the admin can verify styling/tables
 * render correctly before publishing.
 */
export default function ExhibitsTab({
  scenario,
  onChanged,
}: {
  scenario: EditorScenario;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(scenario.exhibits[0]?.id ?? null);
  const [creating, setCreating] = useState(false);

  const active = scenario.exhibits.find((e) => e.id === selected) ?? null;

  return (
    <div className="grid grid-cols-12 gap-4">
      <aside className="col-span-4 rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Exhibits</div>
          <button
            onClick={() => setCreating(true)}
            className="text-xs font-medium text-uq-accent hover:text-uq-accent-hover hover:underline transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded"
          >
            + Add
          </button>
        </div>
        {scenario.exhibits.length === 0 && !creating && (
          <div className="text-xs text-uq-3 py-4 text-center">
            No exhibits yet. Click <span className="font-medium text-uq-2">+ Add</span> to create one.
          </div>
        )}
        <ul className="space-y-1">
          {scenario.exhibits.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => { setSelected(e.id); setCreating(false); }}
                className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] ${
                  selected === e.id && !creating ? "bg-uq-accent-soft border border-uq-accent text-uq" : "border border-transparent hover:bg-uq-elev2 text-uq-2"
                }`}
              >
                {e.title}
                <div className="font-mono text-xs text-uq-3">{Math.ceil(e.html.length / 1024)} KB</div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="col-span-8">
        {creating ? (
          <ExhibitForm
            scenarioId={scenario.id}
            exhibit={null}
            onDone={(created) => {
              setCreating(false);
              setSelected(created.id);
              onChanged();
            }}
            onCancel={() => setCreating(false)}
          />
        ) : active ? (
          <ExhibitForm
            scenarioId={scenario.id}
            exhibit={active}
            onDone={() => onChanged()}
            onDelete={() => { setSelected(null); onChanged(); }}
          />
        ) : (
          <div className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass p-8 text-center text-sm text-uq-3">
            Select or add an exhibit to edit.
          </div>
        )}
      </section>
    </div>
  );
}

function ExhibitForm({
  scenarioId,
  exhibit,
  onDone,
  onDelete,
  onCancel,
}: {
  scenarioId: string;
  exhibit: EditorExhibit | null;
  onDone: (exhibit: EditorExhibit) => void;
  onDelete?: () => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(exhibit?.title ?? "");
  const [html, setHtml] = useState(exhibit?.html ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0); // force iframe reload

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const url = exhibit
        ? `/api/admin/recruitment/scenarios/${scenarioId}/exhibits/${exhibit.id}`
        : `/api/admin/recruitment/scenarios/${scenarioId}/exhibits`;
      const res = await fetch(url, {
        method: exhibit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), html }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      onDone(body.exhibit);
      setPreviewKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!exhibit) return;
    if (!confirm(`Delete exhibit "${exhibit.title}"? Tasks that reference it will be unlinked.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/recruitment/scenarios/${scenarioId}/exhibits/${exhibit.id}`,
        { method: "DELETE" }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      onDelete?.();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass p-4 space-y-3">
        <label className="block text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="IDSC Draft Annual Financial Statements 20X5"
            className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">HTML</span>
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder={`<div style="font-family: sans-serif; padding: 1rem;">...</div>`}
            className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm font-mono h-72 text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
          />
          <span className="text-xs text-uq-3 mt-1 block">
            Rendered in a sandboxed iframe. Include inline styles — external stylesheets will not load.
          </span>
        </label>

        {error && <div className="rounded-md px-3 py-2 text-sm border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">{error}</div>}

        <div className="flex items-center justify-between pt-1">
          <div>
            {exhibit && onDelete && (
              <button
                onClick={remove}
                disabled={saving}
                className="text-sm font-medium text-[color:var(--uq-danger-text)] hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {onCancel && (
              <button onClick={onCancel} className="text-sm font-medium text-uq-2 hover:text-uq transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded">Cancel</button>
            )}
            <button
              onClick={save}
              disabled={saving || !title || !html}
              className="px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            >
              {saving ? "Saving…" : exhibit ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </div>

      {html && (
        <div className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass p-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3 mb-2">Preview</div>
          {/* Scenario-authored HTML — keep a light plate (HARD RULE #4); do not force dark onto untrusted author markup. */}
          <iframe
            key={previewKey}
            srcDoc={html}
            sandbox=""
            className="w-full h-96 rounded border border-uq bg-white text-slate-900"
            title="Exhibit preview"
          />
        </div>
      )}
    </div>
  );
}
