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
      <aside className="col-span-4 bg-white rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Exhibits</div>
          <button
            onClick={() => setCreating(true)}
            className="text-xs text-[#4B92DB] hover:underline"
          >
            + Add
          </button>
        </div>
        {scenario.exhibits.length === 0 && !creating && (
          <div className="text-xs text-slate-500 py-4 text-center">
            No exhibits yet. Click <span className="font-medium">+ Add</span> to create one.
          </div>
        )}
        <ul className="space-y-1">
          {scenario.exhibits.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => { setSelected(e.id); setCreating(false); }}
                className={`w-full text-left px-2 py-1.5 rounded text-sm ${
                  selected === e.id && !creating ? "bg-emerald-100 text-emerald-900" : "hover:bg-slate-100 text-slate-700"
                }`}
              >
                {e.title}
                <div className="text-xs text-slate-500">{Math.ceil(e.html.length / 1024)} KB</div>
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
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
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
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
        <label className="block text-sm">
          <span className="text-slate-600">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="IDSC Draft Annual Financial Statements 20X5"
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">HTML</span>
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder={`<div style="font-family: sans-serif; padding: 1rem;">...</div>`}
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono h-72"
          />
          <span className="text-xs text-slate-500 mt-1 block">
            Rendered in a sandboxed iframe. Include inline styles — external stylesheets will not load.
          </span>
        </label>

        {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">{error}</div>}

        <div className="flex items-center justify-between pt-1">
          <div>
            {exhibit && onDelete && (
              <button
                onClick={remove}
                disabled={saving}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {onCancel && (
              <button onClick={onCancel} className="text-sm text-slate-600 hover:text-slate-900">Cancel</button>
            )}
            <button
              onClick={save}
              disabled={saving || !title || !html}
              className="px-4 py-2 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338] disabled:bg-slate-300"
            >
              {saving ? "Saving…" : exhibit ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </div>

      {html && (
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Preview</div>
          <iframe
            key={previewKey}
            srcDoc={html}
            sandbox=""
            className="w-full h-96 border border-slate-200 rounded"
            title="Exhibit preview"
          />
        </div>
      )}
    </div>
  );
}
