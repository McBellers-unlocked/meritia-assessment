"use client";

import { useEffect, useState } from "react";
import type { EditorScenario, EditorTask } from "./scenarioEditorTypes";

/**
 * Right-panel editor for memo_ai tasks. Fields: title, brief, totalMarks,
 * exhibit picker (dropdown sourced from the scenario's exhibit library),
 * AI system prompt, deliverable label + placeholder.
 *
 * Saves via PATCH /api/admin/recruitment/scenarios/[id]/tasks/[taskId].
 */
export default function MemoTaskEditor({
  scenario,
  task,
  onSaved,
  onDeleted,
}: {
  scenario: EditorScenario;
  task: EditorTask;
  onSaved: (task: EditorTask) => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [briefMarkdown, setBriefMarkdown] = useState(task.briefMarkdown);
  const [totalMarks, setTotalMarks] = useState(String(task.totalMarks));
  const [systemPrompt, setSystemPrompt] = useState(task.systemPrompt ?? "");
  const [exhibitId, setExhibitId] = useState(task.exhibitId ?? "");
  const [deliverableLabel, setDeliverableLabel] = useState(task.deliverableLabel ?? "");
  const [deliverablePlaceholder, setDeliverablePlaceholder] = useState(task.deliverablePlaceholder ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when switching between tasks.
  useEffect(() => {
    setTitle(task.title);
    setBriefMarkdown(task.briefMarkdown);
    setTotalMarks(String(task.totalMarks));
    setSystemPrompt(task.systemPrompt ?? "");
    setExhibitId(task.exhibitId ?? "");
    setDeliverableLabel(task.deliverableLabel ?? "");
    setDeliverablePlaceholder(task.deliverablePlaceholder ?? "");
    setSavedAt(null);
    setError(null);
  }, [task.id]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/recruitment/scenarios/${scenario.id}/tasks/${task.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            briefMarkdown,
            totalMarks: Number(totalMarks) || 0,
            systemPrompt,
            exhibitId: exhibitId || null,
            deliverableLabel: deliverableLabel.trim(),
            deliverablePlaceholder,
          }),
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      onSaved({ ...task, ...body.task });
      setSavedAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete task "${task.title}"? This cannot be undone.`)) return;
    const res = await fetch(
      `/api/admin/recruitment/scenarios/${scenario.id}/tasks/${task.id}`,
      { method: "DELETE" }
    );
    const body = await res.json();
    if (!res.ok) { setError(body.error || `HTTP ${res.status}`); return; }
    onDeleted();
  };

  // Approximate token count for the system prompt — gives the admin a rough
  // sense of how big their prompt is. Not exact (Claude uses BPE), but a
  // good-enough heuristic (chars/4).
  const approxTokens = Math.round(systemPrompt.length / 4);
  const longPromptWarning = approxTokens > 8000;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          Task {task.number} · <span className="font-mono">memo_ai</span>
        </div>
        <button onClick={remove} className="text-xs text-red-600 hover:text-red-700">Delete task</button>
      </div>

      <label className="block text-sm">
        <span className="text-slate-600">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-sm">
        <span className="text-slate-600">Brief (Markdown)</span>
        <textarea
          value={briefMarkdown}
          onChange={(e) => setBriefMarkdown(e.target.value)}
          placeholder={"**From:** Chief of MS Division\n**To:** You\n**Subject:** ...\n\nI need your review of..."}
          className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono h-40"
        />
        <span className="text-xs text-slate-500 mt-1 block">
          Shown to the candidate at the top of the task panel. Supports Markdown.
        </span>
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-slate-600">Total marks</span>
          <input
            type="number"
            min={0}
            max={1000}
            value={totalMarks}
            onChange={(e) => setTotalMarks(e.target.value)}
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Exhibit</span>
          <select
            value={exhibitId}
            onChange={(e) => setExhibitId(e.target.value)}
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">— Select exhibit —</option>
            {scenario.exhibits.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.title}</option>
            ))}
          </select>
          <span className="text-xs text-slate-500 mt-1 block">
            Add exhibits on the <span className="font-medium">Exhibits</span> tab first.
          </span>
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-slate-600">AI system prompt</span>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are the [Organisation] Analysis System... Think of yourself as a smart analyst sitting next to the candidate..."
          className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono h-72"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-slate-500">
            Defines how the AI investigation assistant behaves during this task. Cached server-side for cost/latency.
          </span>
          <span className={`text-xs font-mono ${longPromptWarning ? "text-amber-700" : "text-slate-500"}`}>
            ≈{approxTokens.toLocaleString()} tokens
          </span>
        </div>
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-slate-600">Deliverable label</span>
          <input
            value={deliverableLabel}
            onChange={(e) => setDeliverableLabel(e.target.value)}
            placeholder="Memo to the Chief of MS Division"
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Deliverable placeholder</span>
          <textarea
            value={deliverablePlaceholder}
            onChange={(e) => setDeliverablePlaceholder(e.target.value)}
            placeholder="Draft your memo to the Chief... Identify issues and recommend actions."
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm h-24"
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
          {saving ? "Saving…" : "Save task"}
        </button>
      </div>
    </div>
  );
}
