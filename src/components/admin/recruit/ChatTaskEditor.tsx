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
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          Task {task.number} · <span className="font-mono">chat</span>
        </div>
        <button onClick={remove} className="text-xs text-red-600 hover:text-red-700">Delete task</button>
      </div>

      <label className="block text-sm">
        <span className="text-slate-600">Task title</span>
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
          placeholder="During the assessment, you may be contacted by a colleague about an urgent issue. Engage appropriately."
          className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono h-24"
        />
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
          <span className="text-slate-600">Trigger (min:sec after start)</span>
          <div className="mt-1 flex items-center gap-1">
            <input type="number" min={0} value={triggerMin} onChange={(e) => setTriggerMin(e.target.value)} className="w-20 border border-slate-300 rounded-md px-3 py-2 text-sm" />
            <span className="text-slate-500">:</span>
            <input type="number" min={0} max={59} value={triggerSec} onChange={(e) => setTriggerSec(e.target.value)} className="w-20 border border-slate-300 rounded-md px-3 py-2 text-sm" />
          </div>
        </label>
      </div>

      <div className="border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-[#1B2A4A] mb-3">Persona</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-slate-600">Persona name</span>
            <input
              value={personaName}
              onChange={(e) => setPersonaName(e.target.value)}
              placeholder="Priya Sharma"
              className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Persona role</span>
            <input
              value={personaRole}
              onChange={(e) => setPersonaRole(e.target.value)}
              placeholder="Finance Director"
              className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="block text-sm mt-4">
          <span className="text-slate-600">Opener message</span>
          <textarea
            value={openerMessage}
            onChange={(e) => setOpenerMessage(e.target.value)}
            placeholder="Hey — sorry to barge in. Got a fire here, need 60 seconds of your time…"
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm h-24"
          />
          <span className="text-xs text-slate-500 mt-1 block">
            The first message the candidate sees when the chat popup appears.
          </span>
        </label>
        <label className="block text-sm mt-4">
          <span className="text-slate-600">System prompt</span>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono h-60"
          />
          <span className="text-xs text-slate-500 mt-1 block">
            Describes the persona, the issue, and how to behave. Server automatically wraps this with a scenario-context block and a safety tail.
          </span>
        </label>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <label className="block text-sm">
            <span className="text-slate-600">Max turns</span>
            <input
              type="number"
              min={1}
              max={30}
              value={maxTurns}
              onChange={(e) => setMaxTurns(e.target.value)}
              className="mt-1 block w-24 border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <span className="text-xs text-slate-500 mt-1 block">
              Hard cap on candidate messages to bound cost + prevent loops.
            </span>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Expected outcomes (marker notes)</span>
            <textarea
              value={expectedOutcomes}
              onChange={(e) => setExpectedOutcomes(e.target.value)}
              placeholder="Candidate should recognise the pressure tactic, decline to commit without data, and offer to circle back."
              className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm h-20"
            />
          </label>
        </div>
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
