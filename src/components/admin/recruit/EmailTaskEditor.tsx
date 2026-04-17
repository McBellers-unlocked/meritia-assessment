"use client";

import { useEffect, useState } from "react";
import type { EditorScenario, EditorTask, EditorEmail } from "./scenarioEditorTypes";

/**
 * Right-panel editor for email_inbox tasks. Manages the task's brief plus
 * the list of scripted emails that fire during the candidate's session.
 * Each email carries its trigger offset (mm:ss relative to startedAt), the
 * sender/subject/body, and the expected action (reply / ignore / flag /
 * forward) which markers use to evaluate judgment.
 */
export default function EmailTaskEditor({
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [creatingEmail, setCreatingEmail] = useState(false);

  useEffect(() => {
    setTitle(task.title);
    setBriefMarkdown(task.briefMarkdown);
    setTotalMarks(String(task.totalMarks));
    setSavedAt(null);
    setError(null);
    setEditingEmailId(null);
    setCreatingEmail(false);
  }, [task.id]);

  const saveTaskHeader = async () => {
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
    if (!confirm(`Delete task "${task.title}" and all its scripted emails?`)) return;
    const res = await fetch(
      `/api/admin/recruitment/scenarios/${scenario.id}/tasks/${task.id}`,
      { method: "DELETE" }
    );
    const body = await res.json();
    if (!res.ok) { setError(body.error || `HTTP ${res.status}`); return; }
    onDeleted();
  };

  const editingEmail = task.emails.find((e) => e.id === editingEmailId) ?? null;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Task {task.number} · <span className="font-mono">email_inbox</span>
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
            placeholder="You've just started in your new role. Emails will arrive as the day unfolds. Decide how to handle each one."
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono h-28"
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-600">Total marks</span>
          <input
            type="number"
            min={0}
            max={1000}
            value={totalMarks}
            onChange={(e) => setTotalMarks(e.target.value)}
            className="mt-1 block w-40 border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </label>

        {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">{error}</div>}

        <div className="flex items-center justify-end gap-3">
          {savedAt && <span className="text-xs text-slate-500">Saved {savedAt.toLocaleTimeString()}</span>}
          <button
            onClick={saveTaskHeader}
            disabled={saving}
            className="px-4 py-2 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338] disabled:bg-slate-300"
          >
            {saving ? "Saving…" : "Save task"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#1B2A4A]">Scripted emails ({task.emails.length})</h3>
          <button
            onClick={() => { setCreatingEmail(true); setEditingEmailId(null); }}
            className="text-xs text-[#4B92DB] hover:underline"
          >
            + Add email
          </button>
        </div>

        {task.emails.length === 0 && !creatingEmail && (
          <div className="text-xs text-slate-500 py-6 text-center">
            No emails scripted yet.
          </div>
        )}

        {task.emails.length > 0 && (
          <EmailTimeline emails={task.emails} totalMinutes={scenario.defaultTotalMinutes} />
        )}

        <ul className="divide-y divide-slate-100 mt-2">
          {task.emails.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => { setEditingEmailId(e.id); setCreatingEmail(false); }}
                className={`w-full text-left py-2 px-2 rounded flex items-center gap-3 ${
                  editingEmailId === e.id ? "bg-emerald-50" : "hover:bg-slate-50"
                }`}
              >
                <span className="font-mono text-xs text-slate-500 w-14 flex-shrink-0">{formatOffset(e.triggerOffsetSeconds)}</span>
                <span className="flex-1 min-w-0">
                  <div className="text-sm text-[#1B2A4A] truncate">{e.subject || "(no subject)"}</div>
                  <div className="text-xs text-slate-500 truncate">from {e.senderName} &lt;{e.senderEmail}&gt;</div>
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  {e.expectedAction}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {(editingEmail || creatingEmail) && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <EmailForm
              scenarioId={scenario.id}
              taskId={task.id}
              email={editingEmail}
              onDone={() => {
                setEditingEmailId(null);
                setCreatingEmail(false);
                // Parent needs to refresh — triggered by onSaved + invalidating.
                // We'll just reload the scenario via onSaved with the same task to prompt a re-fetch upstream.
                onSaved(task);
              }}
              onCancel={() => { setEditingEmailId(null); setCreatingEmail(false); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function formatOffset(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Tiny horizontal strip showing when each email fires across the assessment
 * window. Helps admins spot scheduling clashes at a glance.
 */
function EmailTimeline({ emails, totalMinutes }: { emails: EditorEmail[]; totalMinutes: number }) {
  const total = totalMinutes * 60;
  return (
    <div className="relative h-6 bg-slate-100 rounded mb-2" title={`Timeline (${totalMinutes} min)`}>
      {emails.map((e) => {
        const pct = Math.min(100, (e.triggerOffsetSeconds / total) * 100);
        return (
          <div
            key={e.id}
            className="absolute top-0 bottom-0 w-1 bg-emerald-500 rounded"
            style={{ left: `${pct}%` }}
            title={`${formatOffset(e.triggerOffsetSeconds)} — ${e.subject}`}
          />
        );
      })}
      <div className="absolute -bottom-4 left-0 text-[10px] text-slate-500">0:00</div>
      <div className="absolute -bottom-4 right-0 text-[10px] text-slate-500">{totalMinutes}:00</div>
    </div>
  );
}

function EmailForm({
  scenarioId,
  taskId,
  email,
  onDone,
  onCancel,
}: {
  scenarioId: string;
  taskId: string;
  email: EditorEmail | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [triggerMin, setTriggerMin] = useState(email ? String(Math.floor(email.triggerOffsetSeconds / 60)) : "5");
  const [triggerSec, setTriggerSec] = useState(email ? String(email.triggerOffsetSeconds % 60) : "0");
  const [senderName, setSenderName] = useState(email?.senderName ?? "");
  const [senderEmail, setSenderEmail] = useState(email?.senderEmail ?? "");
  const [subject, setSubject] = useState(email?.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(email?.bodyHtml ?? "");
  const [expectedAction, setExpectedAction] = useState<EditorEmail["expectedAction"]>(email?.expectedAction ?? "reply");
  const [markerNotes, setMarkerNotes] = useState(email?.markerNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const triggerOffsetSeconds = (Number(triggerMin) || 0) * 60 + (Number(triggerSec) || 0);
      const payload = {
        triggerOffsetSeconds,
        senderName: senderName.trim(),
        senderEmail: senderEmail.trim(),
        subject: subject.trim(),
        bodyHtml,
        expectedAction,
        markerNotes: markerNotes.trim() || null,
      };
      const url = email
        ? `/api/admin/recruitment/scenarios/${scenarioId}/tasks/${taskId}/emails/${email.id}`
        : `/api/admin/recruitment/scenarios/${scenarioId}/tasks/${taskId}/emails`;
      const res = await fetch(url, {
        method: email ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!email) return;
    if (!confirm(`Delete this scripted email?`)) return;
    const res = await fetch(
      `/api/admin/recruitment/scenarios/${scenarioId}/tasks/${taskId}/emails/${email.id}`,
      { method: "DELETE" }
    );
    const body = await res.json();
    if (!res.ok) { setError(body.error || `HTTP ${res.status}`); return; }
    onDone();
  };

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-[#1B2A4A]">
        {email ? "Edit email" : "New email"}
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block text-sm sm:col-span-1">
          <span className="text-slate-600">Trigger (min:sec after start)</span>
          <div className="mt-1 flex items-center gap-1">
            <input type="number" min={0} value={triggerMin} onChange={(e) => setTriggerMin(e.target.value)} className="w-20 border border-slate-300 rounded-md px-3 py-2 text-sm" />
            <span className="text-slate-500">:</span>
            <input type="number" min={0} max={59} value={triggerSec} onChange={(e) => setTriggerSec(e.target.value)} className="w-20 border border-slate-300 rounded-md px-3 py-2 text-sm" />
          </div>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-slate-600">Expected action (for markers)</span>
          <select
            value={expectedAction}
            onChange={(e) => setExpectedAction(e.target.value as EditorEmail["expectedAction"])}
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="reply">Reply</option>
            <option value="ignore">Ignore / do not respond</option>
            <option value="flag">Flag for follow-up</option>
            <option value="forward">Forward / escalate</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Sender name</span>
          <input
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Priya Sharma"
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-slate-600">Sender email</span>
          <input
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
            placeholder="priya.sharma@idsc.int"
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-slate-600">Subject</span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Body (HTML)</span>
        <textarea
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
          className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono h-40"
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Marker notes (optional)</span>
        <textarea
          value={markerNotes}
          onChange={(e) => setMarkerNotes(e.target.value)}
          placeholder="What a strong response looks like, common traps, etc."
          className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm h-20"
        />
      </label>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">{error}</div>}

      <div className="flex items-center justify-between">
        <div>
          {email && (
            <button onClick={remove} className="text-sm text-red-600 hover:text-red-700">Delete email</button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="text-sm text-slate-600 hover:text-slate-900">Cancel</button>
          <button
            onClick={save}
            disabled={saving || !senderName || !senderEmail || !subject || !bodyHtml}
            className="px-4 py-2 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338] disabled:bg-slate-300"
          >
            {saving ? "Saving…" : email ? "Save" : "Add email"}
          </button>
        </div>
      </div>
    </div>
  );
}
