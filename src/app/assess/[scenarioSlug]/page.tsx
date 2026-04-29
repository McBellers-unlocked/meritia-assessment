"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import AssessmentView from "@/components/recruit/AssessmentView";

export default function AssessRouterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>
      <AssessRouter />
    </Suspense>
  );
}

function AssessRouter() {
  const params = useParams<{ scenarioSlug: string }>();
  const search = useSearchParams();
  const token = search.get("token") || "";
  const [stateData, setStateData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [acknowledge, setAcknowledge] = useState(false);

  const reload = async () => {
    setError(null);
    if (!token) {
      setError("Your assessment URL is missing a token. Check the link from your invitation email.");
      return;
    }
    try {
      const res = await fetch(`/api/assess/state/${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setStateData(body);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => { void reload(); }, [token]);

  const begin = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/assess/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      await reload();
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f7fb] flex items-center justify-center p-6">
        <div className="max-w-md bg-white rounded-lg border border-red-200 p-6">
          <div className="text-red-700 font-semibold mb-2">Cannot start assessment</div>
          <div className="text-sm text-slate-700">{error}</div>
          <div className="text-xs text-slate-500 mt-4">Token: <code className="bg-slate-100 px-1 rounded">{token || "(missing)"}</code></div>
        </div>
      </div>
    );
  }
  if (!stateData) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading assessment…</div>;

  // Pre-start: landing
  if (stateData.stage === "invited") {
    return (
      <Landing
        scenario={stateData.scenario}
        assessment={stateData.assessment}
        anonymousId={stateData.candidate.anonymousId}
        acknowledge={acknowledge}
        setAcknowledge={setAcknowledge}
        onBegin={() => void begin()}
        starting={starting}
      />
    );
  }

  // Submitted / expired
  if (stateData.stage === "submitted" || stateData.stage === "expired" || stateData.candidate?.submittedAt) {
    return <Submitted submittedAt={stateData.candidate?.submittedAt} anonymousId={stateData.candidate?.anonymousId} />;
  }

  // In progress
  return <AssessmentView token={token} initial={stateData} onReload={reload} />;
}

/* ------------------------------------------------------------------ */

function Landing({
  scenario, assessment, anonymousId, acknowledge, setAcknowledge, onBegin, starting,
}: {
  scenario: { title: string; organisation: string; positionTitle: string; taskCount: number };
  assessment: { title: string; totalMinutes: number; closeDate: string };
  anonymousId: string;
  acknowledge: boolean;
  setAcknowledge: (v: boolean) => void;
  onBegin: () => void;
  starting: boolean;
}) {
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#1B2A4A]">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <span className="text-xl font-bold text-[#1B3A5C]">UNIQAssess</span>
            <span className="text-xs text-slate-500 hidden sm:inline">Powered by UNICC</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">{anonymousId}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-7">
          <div className="text-xs uppercase tracking-wider text-[#4B92DB] font-semibold">Technical Assessment</div>
          <h1 className="text-2xl font-semibold mt-1 mb-1">{scenario.positionTitle}</h1>
          <div className="text-sm text-slate-600">{scenario.organisation}</div>
          <div className="text-xs text-slate-500 italic mt-1">
            IDSC is a fictionalised entity modelled on a real UN-system centre. All names, figures, and internal details are invented for this assessment — cross-referencing the real-world organisation will not help.
          </div>

          <div className="mt-6 grid sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-[#f5f8fb] border border-slate-200 rounded-md p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Duration</div>
              <div className="text-lg font-semibold">{assessment.totalMinutes} minutes</div>
              <div className="text-xs text-slate-500 mt-0.5">Single continuous timer</div>
            </div>
            <div className="bg-[#f5f8fb] border border-slate-200 rounded-md p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Tasks</div>
              <div className="text-lg font-semibold">{scenario.taskCount}</div>
              <div className="text-xs text-slate-500 mt-0.5">Switch freely</div>
            </div>
            <div className="bg-[#f5f8fb] border border-slate-200 rounded-md p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Closes</div>
              <div className="text-lg font-semibold">
                {new Date(assessment.closeDate).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Window deadline</div>
            </div>
          </div>

          <div className="mt-7 prose prose-sm max-w-none text-slate-700">
            <h2 className="text-base font-semibold text-[#1B2A4A]">What to expect</h2>
            <p>
              This assessment has two tasks. You have <strong>{assessment.totalMinutes} minutes total</strong>.
              You may switch between tasks at any time and divide the time as you see fit — time management is
              part of what is being assessed.
            </p>
            <p>For each task you will have:</p>
            <ul className="text-sm list-disc pl-5">
              <li>An exhibit document — for example a contract, a financial statement, a report, or a briefing pack.</li>
              <li>The IDSC Knowledge System — an in-app AI assistant holding the underlying data, text, and reference material. Ask it specific questions; it will not volunteer issues for you.</li>
              <li>A workspace for your written deliverable. It autosaves every few seconds.</li>
            </ul>
            <p>
              Your responses are evaluated holistically. There is no pass mark — your work will be ranked
              alongside other candidates. The way you investigate (the AI interaction) is recorded and
              reviewed alongside your written response.
            </p>

            <h2 className="text-base font-semibold text-[#1B2A4A] mt-5">Important</h2>
            <ul className="text-sm list-disc pl-5">
              <li>Once you click <strong>Begin</strong> the {assessment.totalMinutes}-minute timer starts and cannot be paused.</li>
              <li>You may close your browser and return — your work and timer continue server-side.</li>
              <li>This URL is single-use. If a different browser tries to use the same link, it will be locked out.</li>
              <li>You are expected to use the IDSC Knowledge System (the in-app AI assistant) as part of your work — your interaction trail forms part of the assessment.</li>
              <li>External AI tools (e.g. ChatGPT, Claude, Gemini, Copilot) and online lookups are not permitted. Your activity during the assessment — including pasted content, tab-switches, and AI interactions — is logged and reviewed by examiners. Printed reference material relevant to the role is allowed.</li>
              <li>When time expires, your responses are submitted automatically.</li>
            </ul>
          </div>

          <details className="mt-6 border border-slate-200 rounded-md bg-slate-50/60">
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-[#1B2A4A] select-none">
              Privacy and data use
            </summary>
            <div className="px-4 pb-4 pt-1 text-sm text-slate-700 space-y-2">
              <p>
                <strong>What we collect:</strong> your name and email (from the recruitment panel), your written
                responses, every message you exchange with the in-app AI assistant, and activity events during the
                assessment (tab-switches and the length of any pasted content — pasted text itself is not stored).
              </p>
              <p>
                <strong>Where it goes:</strong> your prompts and the assistant&rsquo;s replies are processed via the
                Anthropic Claude API in order to generate responses. All candidate data is stored in our AWS RDS
                database (UK/EU region).
              </p>
              <p>
                <strong>Who sees it:</strong> the recruitment panel (examiners) and authorised UNIQAssess
                administrators. During marking, examiners see you only by an anonymous identifier
                (e.g. &ldquo;{anonymousId}&rdquo;); your name and email are hidden from them.
              </p>
              <p>
                <strong>How long we keep it:</strong> your written responses, AI interactions, and activity logs are
                retained for <strong>24 months after submission</strong>, then deleted. Anonymised, aggregate statistics
                (e.g. cohort benchmarks) may be retained beyond that point.
              </p>
              <p>
                <strong>Your rights:</strong> to request access to, correction of, or deletion of your personal data,
                email{" "}
                <a href="mailto:personnel@unicc.org" className="text-[#4B92DB] underline">personnel@unicc.org</a>.
              </p>
            </div>
          </details>

          <label className="flex items-start gap-2 mt-6 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={acknowledge}
              onChange={(e) => setAcknowledge(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1B2A4A] focus:ring-[#4B92DB]"
            />
            <span>I confirm this is my own work, that I will use only the in-app IDSC Knowledge System (no external AI tools), that I understand my activity during the assessment is logged, and that I will complete the assessment in a single sitting where possible.</span>
          </label>

          <div className="mt-6 flex items-center justify-end">
            <button
              onClick={onBegin}
              disabled={!acknowledge || starting}
              className="px-6 py-2.5 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338] disabled:bg-slate-300"
            >
              {starting ? "Starting…" : `Begin assessment (${assessment.totalMinutes} min)`}
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-400 text-center mt-6">
          Powered by UNIQAssess · Your responses and AI interactions are recorded for assessment purposes.
        </div>
      </main>
    </div>
  );
}

function Submitted({ submittedAt, anonymousId }: { submittedAt?: string | null; anonymousId?: string }) {
  return (
    <div className="min-h-screen bg-[#f5f7fb] flex items-center justify-center p-6">
      <div className="max-w-xl bg-white rounded-lg border border-slate-200 shadow-sm p-8 text-center">
        <div className="text-[#4B92DB] text-xs uppercase tracking-wider font-semibold">Assessment complete</div>
        <h1 className="text-2xl font-semibold text-[#1B2A4A] mt-2">Thank you</h1>
        <p className="text-sm text-slate-600 mt-3">
          Your assessment has been submitted. The selection panel will be in touch in due course.
        </p>
        {submittedAt && (
          <div className="mt-5 text-xs text-slate-400">
            Submitted at {new Date(submittedAt).toLocaleString()}
          </div>
        )}
        {anonymousId && (
          <div className="text-xs text-slate-400 mt-1 font-mono">Reference: {anonymousId}</div>
        )}
      </div>
    </div>
  );
}
