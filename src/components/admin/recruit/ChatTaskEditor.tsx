"use client";

import { useEffect, useState } from "react";
import type { EditorScenario, EditorTask } from "./scenarioEditorTypes";

/**
 * Right-panel editor for chat tasks. Manages the task metadata plus the
 * single persona script that drives the urgent-issue popup during the
 * candidate's session. Claude runs the persona with the admin-authored
 * systemPrompt plus a server-side safety tail (see buildPersonaSystemPrompt
 * in /api/assess/chat/route.ts).
 */
export default function ChatTaskEditor({
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

  const existing = task.chatScripts[0] ?? null;
  const [triggerMin, setTriggerMin] = useState(existing ? String(Math.floor(existing.triggerOffsetSeconds / 60)) : "15");
  const [triggerSec, setTriggerSec] = useState(existing ? String(existing.triggerOffsetSeconds % 60) : "0");
  const [personaName, setPersonaName] = useState(existing?.personaName ?? "");
  const [personaRole, setPersonaRole] = useState(existing?.personaRole ?? "");
  const [openerMessage, setOpenerMessage] = useState(existing?.openerMessage ?? "");
  const [systemPrompt, setSystemPrompt] = useState(existing?.systemPrompt ?? DEFAULT_PERSONA_PROMPT);
  const [maxTurns, setMaxTurns] = useState(String(existing?.maxTurns ?? 8));
  const [expectedOutcomes, setExpectedOutcomes] = useState(existing?.expectedOutcomes ?? "");

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(task.title);
    setBriefMarkdown(task.briefMarkdown);
    setTotalMarks(String(task.totalMarks));
    const s = task.chatScripts[0] ?? null;
    setTriggerMin(s ? String(Math.floor(s.triggerOffsetSeconds / 60)) : "15");
    setTriggerSec(s ? String(s.triggerOffsetSeconds % 60) : "0");
    setPersonaName(s?.personaName ?? "");
    setPersonaRole(s?.personaRole ?? "");
    setOpenerMessage(s?.openerMessage ?? "");
    setSystemPrompt(s?.systemPrompt ?? DEFAULT_PERSONA_PROMPT);
    setMaxTurns(String(s?.maxTurns ?? 8));
    setExpectedOutcomes(s?.expectedOutcomes ?? "");
    setSavedAt(null);
    setError(null);
  }, [task.id]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // Patch the task header, then PUT the chat script. Two sequential calls
      // so a failure on the script doesn't silently save stale task state.
      const taskRes = await fetch(
        `/api/admin/recruitment/scenarios/${scenario.id}/tasks/${task.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            briefMarkdown,
            totalMarks: Number(totalMarks) || 0,
          }),
        }
      );
      const taskBody = await taskRes.json();
      if (!taskRes.ok) throw new Error(taskBody.error || `HTTP ${taskRes.status}`);

      const scriptRes = await fetch(
        `/api/admin/recruitment/scenarios/${scenario.id}/tasks/${task.id}/chat-script`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            triggerOffsetSeconds: (Number(triggerMin) || 0) * 60 + (Number(triggerSec) || 0),
            personaName: personaName.trim(),
            personaRole: personaRole.trim(),
            openerMessage: openerMessage.trim(),
            systemPrompt,
            maxTurns: Number(maxTurns) || 8,
            expectedOutcomes: expectedOutcomes.trim() || null,
          }),
        }
      );
      const scriptBody = await scriptRes.json();
      if (!scriptRes.ok) throw new Error(scriptBody.error || `HTTP ${scriptRes.status}`);

      // Refresh from parent to pick up the new script row.
      onSaved({ ...task, ...taskBody.task });
      setSavedAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete task "${task.title}" and its chat script?`)) return;
    const res = await fetch(
      `/api/admin/recruitment/scenarios/${scenario.id}/tasks/${task.id}`,
      { method: "DELETE" }
    );
    const body = await res.json();
    if (!res.ok) { setError(body.error || `HTTP ${res.status}`); return; }
    onDeleted();
  };

  return (
    <div className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">
          Task {task.number} · <span className="text-uq-cyan">chat</span>
        </div>
        <button onClick={remove} className="text-xs font-medium text-[color:var(--uq-danger-text)] hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded">Delete task</button>
      </div>

      <label className="block text-sm">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Task title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
        />
      </label>

      <label className="block text-sm">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Brief (Markdown)</span>
        <textarea
          value={briefMarkdown}
          onChange={(e) => setBriefMarkdown(e.target.value)}
          placeholder="During the assessment, you may be contacted by a colleague about an urgent issue. Engage appropriately."
          className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm font-mono h-24 text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
        />
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Total marks</span>
          <input
            type="number"
            min={0}
            max={1000}
            value={totalMarks}
            onChange={(e) => setTotalMarks(e.target.value)}
            className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Trigger (min:sec after start)</span>
          <div className="mt-1 flex items-center gap-1">
            <input type="number" min={0} value={triggerMin} onChange={(e) => setTriggerMin(e.target.value)} className="w-20 rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1" />
            <span className="text-uq-3">:</span>
            <input type="number" min={0} max={59} value={triggerSec} onChange={(e) => setTriggerSec(e.target.value)} className="w-20 rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1" />
          </div>
        </label>
      </div>

      <div className="border-t border-uq-faint pt-4">
        <h3 className="text-base font-semibold text-uq mb-3">Persona</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Persona name</span>
            <input
              value={personaName}
              onChange={(e) => setPersonaName(e.target.value)}
              placeholder="Priya Sharma"
              className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
            />
          </label>
          <label className="block text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Persona role</span>
            <input
              value={personaRole}
              onChange={(e) => setPersonaRole(e.target.value)}
              placeholder="Finance Director"
              className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
            />
          </label>
        </div>
        <label className="block text-sm mt-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Opener message</span>
          <textarea
            value={openerMessage}
            onChange={(e) => setOpenerMessage(e.target.value)}
            placeholder="Hey — sorry to barge in. Got a fire here, need 60 seconds of your time…"
            className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm h-24 text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
          />
          <span className="text-xs text-uq-3 mt-1 block">
            The first message the candidate sees when the chat popup appears.
          </span>
        </label>
        <label className="block text-sm mt-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">System prompt</span>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm font-mono h-60 text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
          />
          <span className="text-xs text-uq-3 mt-1 block">
            Describes the persona, the issue, and how to behave. Server automatically wraps this with a scenario-context block and a safety tail.
          </span>
        </label>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <label className="block text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Max turns</span>
            <input
              type="number"
              min={1}
              max={30}
              value={maxTurns}
              onChange={(e) => setMaxTurns(e.target.value)}
              className="mt-1 block w-24 rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
            />
            <span className="text-xs text-uq-3 mt-1 block">
              Hard cap on candidate messages to bound cost + prevent loops.
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Expected outcomes (marker notes)</span>
            <textarea
              value={expectedOutcomes}
              onChange={(e) => setExpectedOutcomes(e.target.value)}
              placeholder="Candidate should recognise the pressure tactic, decline to commit without data, and offer to circle back."
              className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm h-20 text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
            />
          </label>
        </div>
      </div>

      {error && <div className="rounded-md px-3 py-2 text-sm border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">{error}</div>}

      <div className="flex items-center justify-end gap-3 pt-2">
        {savedAt && <span className="text-xs text-uq-3">Saved {savedAt.toLocaleTimeString()}</span>}
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
        >
          {saving ? "Saving…" : "Save task"}
        </button>
      </div>
    </div>
  );
}

const DEFAULT_PERSONA_PROMPT = `You are roleplaying a specific colleague contacting a new hire on an internal chat. Keep replies short and natural — one or two sentences, sometimes fragments. Do not sound like a chatbot.

THE ISSUE
[Describe the urgent issue this persona is chasing the candidate about. Be specific: what happened, why it's urgent, what they want from the candidate.]

HOW YOU BEHAVE
- Be a real person under pressure: slightly impatient, focused on your goal.
- Push for a decision or commitment from the candidate. Don't take "let me check" as a final answer.
- If the candidate asks for more information, give them just enough to keep the conversation moving.
- If they handle you well (ask the right questions, resist pressure appropriately), acknowledge it and wind down.
- If they make a clear wrong call, don't correct them — let the marker judge.

HOW TO END
End the chat naturally once the candidate has clearly resolved the situation, or after 6-8 candidate messages, whichever comes first.`;
