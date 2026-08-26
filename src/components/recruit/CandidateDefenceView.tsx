"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssessmentModeBadge } from "./AssessmentModeBadge";

type Defence = {
  questions: Array<{ id: string; text: string }>;
  answers: Array<{ questionId: string; text: string; savedAt: string | null }>;
  personalised: boolean;
  deadline: string;
};

export default function CandidateDefenceView({ token, initial, onReload }: { token: string; initial: { assessment: { assessmentMode: string; defenceMinutes: number }; candidate: { anonymousId: string }; defence: Defence }; onReload: () => Promise<void> | void }) {
  const defence = initial.defence;
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(defence.answers.map((item) => [item.questionId, item.text])));
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const autoSubmitAttempted = useRef(false);
  const remaining = Math.max(0, new Date(defence.deadline).getTime() - now);
  const time = useMemo(() => `${String(Math.floor(remaining / 60_000)).padStart(2, "0")}:${String(Math.floor((remaining % 60_000) / 1000)).padStart(2, "0")}`, [remaining]);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1_000); return () => clearInterval(id); }, []);
  const save = useCallback(async (questionId: string, answer: string) => {
    setSaving((value) => ({ ...value, [questionId]: true }));
    setSaveErrors((value) => ({ ...value, [questionId]: null }));
    try {
      const response = await fetch("/api/assess/defence", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, questionId, answer }) });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Autosave failed. Your text remains in this browser; keep this page open and retry.");
      }
    } catch (error) {
      setSaveErrors((value) => ({ ...value, [questionId]: (error as Error).message }));
      throw error;
    } finally {
      setSaving((value) => ({ ...value, [questionId]: false }));
    }
  }, [token]);
  const update = (questionId: string, value: string) => {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    if (timers.current[questionId]) clearTimeout(timers.current[questionId]);
    timers.current[questionId] = setTimeout(() => void save(questionId, value), 800);
  };
  const submit = useCallback(async (automatic = false) => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const saves = await Promise.allSettled(defence.questions.map((question) => save(question.id, answers[question.id] ?? "")));
      if (!automatic && saves.some((result) => result.status === "rejected")) {
        throw new Error("One or more answers could not be saved. Your text remains on this page; check your connection and try again.");
      }
      const response = await fetch("/api/assess/defence/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Defence submission failed. Please try again.");
      }
      await onReload();
    } catch (error) {
      setSubmitError((error as Error).message);
      setSubmitting(false);
    }
  }, [answers, defence.questions, onReload, save, submitting, token]);
  useEffect(() => {
    if (remaining === 0 && !submitting && !autoSubmitAttempted.current) {
      autoSubmitAttempted.current = true;
      void submit(true);
    }
  }, [remaining, submit, submitting]);

  return (
    <div className="min-h-screen bg-uq-bg px-6 py-8 text-uq">
      <main className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div><AssessmentModeBadge mode={initial.assessment.assessmentMode} /><h1 className="mt-2 text-2xl font-semibold">Written reasoning defence</h1><p className="mt-1 text-sm text-uq-2">Your main work is locked. These answers are reviewed by a human and are not auto-scored.</p></div>
          <div className="rounded-xl border border-uq-strong bg-uq-elev1 px-4 py-3 text-right"><div className="font-mono text-[10px] uppercase tracking-[0.12em] text-uq-3">Time remaining</div><div className="font-mono text-xl tabular-nums">{time}</div></div>
        </header>
        <div className="mt-6 rounded-xl border border-uq bg-uq-elev1 p-4 text-sm text-uq-2">
          {defence.personalised ? "These two questions were personalised from your submitted work, evidence choices and Knowledge System dialogue." : "Personalised generation was unavailable, so the published fallback questions are being used."}
        </div>
        <div className="mt-5 space-y-5">
          {defence.questions.map((question, index) => (
            <label key={question.id} className="block rounded-xl border border-uq bg-uq-elev1 p-5">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-uq-3">Question {index + 1}</span>
              <span className="mt-2 block text-base font-semibold leading-relaxed text-uq">{question.text}</span>
              <textarea value={answers[question.id] ?? ""} onChange={(event) => update(question.id, event.target.value.slice(0, 8_000))} rows={7} maxLength={8_000} aria-describedby={`${question.id}-save-status`} className="mt-4 block w-full rounded-lg border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq" placeholder="Write approximately 100–200 words." />
              <span id={`${question.id}-save-status`} role={saveErrors[question.id] ? "alert" : "status"} className={`mt-1 block text-right font-mono text-[10px] ${saveErrors[question.id] ? "text-[color:var(--uq-danger-text)]" : "text-uq-3"}`}>
                {saving[question.id] ? "Saving…" : saveErrors[question.id] || "Autosaved"}
              </span>
            </label>
          ))}
        </div>
        {submitError && <div role="alert" className="mt-5 rounded-lg border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] p-3 text-sm text-[color:var(--uq-danger-text)]">{submitError}</div>}
        <div className="mt-6 flex justify-end"><button type="button" onClick={() => void submit(false)} disabled={submitting} className="rounded-lg bg-uq-accent px-5 py-2.5 text-sm font-medium text-[color:var(--uq-text-on-accent)] disabled:opacity-50">{submitting ? "Submitting…" : "Submit defence"}</button></div>
      </main>
    </div>
  );
}
