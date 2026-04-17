"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Interaction { id: string; sequenceNum: number; taskNumber: number; timestamp: string; actor: string; content: string; }
interface ActivityEvent {
  id: string;
  occurredAt: string;
  eventType: string;               // paste | visibility_hidden | visibility_visible
  taskNumber: number | null;
  metadata: Record<string, unknown> | null;
}
interface ResponseRow {
  taskNumber: number; content: string; wordCount: number;
  score: number | null; comments: string | null; issuesIdentified: string[] | null; markedAt: string | null;
}
interface RubricIssue { id: string; title: string; max_marks?: number; description?: string; }
interface RubricCategory { max: number; description?: string; embedded_issues?: RubricIssue[]; indicators?: string[]; rubric?: Record<string,string>; descriptors?: Record<string,string>; }
interface RubricTask { title: string; max_marks: number; categories: Record<string, RubricCategory>; }
interface Rubric { task1: RubricTask; task2: RubricTask; total_marks: number; }

interface MarkData {
  candidate: { id: string; anonymousId: string; startedAt: string; submittedAt: string; timeTakenMin: number | null; totalScore: number | null; };
  assessment: { id: string; title: string; scenarioId: string };
  rubric: Rubric | null;
  responses: ResponseRow[];
  interactions: Interaction[];
  activityEvents: ActivityEvent[];
}

export default function MarkCandidatePage() {
  const params = useParams<{ id: string; candidateId: string }>();
  const router = useRouter();
  const { status } = useSession();
  const [data, setData] = useState<MarkData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<1 | 2>(1);

  // Per-task marking state — initialised from server
  const [scores, setScores] = useState<Record<number, string>>({ 1: "", 2: "" });
  const [comments, setComments] = useState<Record<number, string>>({ 1: "", 2: "" });
  const [issues, setIssues] = useState<Record<number, Set<string>>>({ 1: new Set(), 2: new Set() });
  const [savingTask, setSavingTask] = useState<Record<number, boolean>>({ 1: false, 2: false });
  const [savedAt, setSavedAt] = useState<Record<number, string | null>>({ 1: null, 2: null });

  useEffect(() => { if (status === "unauthenticated") router.push("/login"); }, [status, router]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/admin/recruitment/${params.id}/mark/${params.candidateId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body: MarkData = await res.json();
        setData(body);
        const newScores: Record<number, string> = { 1: "", 2: "" };
        const newComments: Record<number, string> = { 1: "", 2: "" };
        const newIssues: Record<number, Set<string>> = { 1: new Set<string>(), 2: new Set<string>() };
        for (const r of body.responses) {
          newScores[r.taskNumber] = r.score != null ? String(r.score) : "";
          newComments[r.taskNumber] = r.comments ?? "";
          newIssues[r.taskNumber] = new Set(Array.isArray(r.issuesIdentified) ? r.issuesIdentified : []);
        }
        setScores(newScores); setComments(newComments); setIssues(newIssues);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [params.id, params.candidateId]);

  const saveTask = async (taskNumber: 1 | 2) => {
    setSavingTask((s) => ({ ...s, [taskNumber]: true }));
    try {
      const score = scores[taskNumber] === "" ? null : Number(scores[taskNumber]);
      const res = await fetch(`/api/admin/recruitment/${params.id}/mark/${params.candidateId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [`task${taskNumber}`]: {
            score,
            comments: comments[taskNumber] || null,
            issuesIdentified: Array.from(issues[taskNumber]),
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setSavedAt((s) => ({ ...s, [taskNumber]: new Date().toISOString() }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingTask((s) => ({ ...s, [taskNumber]: false }));
    }
  };

  // Debounced auto-save on score / comments / issues change
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout> | null>>({ 1: null, 2: null });
  const triggerSave = (taskNumber: 1 | 2) => {
    if (saveTimers.current[taskNumber]) clearTimeout(saveTimers.current[taskNumber] as any);
    saveTimers.current[taskNumber] = setTimeout(() => void saveTask(taskNumber), 1000);
  };

  if (error) return <Box error={error} />;
  if (!data) return <Box loading />;

  const responseForActive = data.responses.find((r) => r.taskNumber === activeTask);
  const rubricTask = activeTask === 1 ? data.rubric?.task1 : data.rubric?.task2;
  const trailForActive = data.interactions.filter((i) => i.taskNumber === activeTask);
  const activityForActive = (data.activityEvents ?? []).filter(
    (e) => e.taskNumber === activeTask || e.taskNumber === null,
  );
  const issuesForTask: RubricIssue[] = rubricTask
    ? Object.values(rubricTask.categories).flatMap((c) => c.embedded_issues ?? [])
    : [];

  const totalScore =
    (Number(scores[1]) || 0) + (Number(scores[2]) || 0);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs">
              <Link href={`/admin/recruitment/${params.id}/mark`} className="text-[#4B92DB] hover:underline">← Marking list</Link>
            </div>
            <h1 className="text-xl font-semibold text-[#1B2A4A] mt-1">Marking · <span className="font-mono text-base">{data.candidate.anonymousId}</span></h1>
            <div className="text-xs text-slate-500 mt-0.5">
              Time taken: {data.candidate.timeTakenMin ?? "—"} min · Submitted {data.candidate.submittedAt ? new Date(data.candidate.submittedAt).toLocaleString() : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Total score</div>
            <div className="text-2xl font-bold text-[#1B2A4A]">
              {totalScore.toFixed(0)} <span className="text-base font-normal text-slate-500">/ {data.rubric?.total_marks ?? 100}</span>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 pb-2 flex gap-2">
          {[1, 2].map((n) => (
            <button
              key={n}
              onClick={() => setActiveTask(n as 1 | 2)}
              className={[
                "px-3 py-1.5 text-xs font-semibold rounded-md transition",
                activeTask === n
                  ? "bg-[#1B2A4A] text-white"
                  : "bg-white border border-slate-300 text-[#1B2A4A] hover:bg-slate-50",
              ].join(" ")}
            >
              Task {n}
              {scores[n] && <span className="ml-2 opacity-80">{scores[n]}/{(activeTask === n ? rubricTask : (n === 1 ? data.rubric?.task1 : data.rubric?.task2))?.max_marks ?? 50}</span>}
            </button>
          ))}
        </div>
      </header>

      {/* Body — 2 cols: candidate work + marking panel */}
      <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] grid-cols-1">
        {/* Candidate work */}
        <div className="overflow-y-auto px-6 py-4 space-y-4">
          <section className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-[10px] uppercase tracking-wider text-[#4B92DB] font-semibold">Memo · Task {activeTask}</div>
            <div className="text-sm font-semibold text-[#1B2A4A] mb-3">{rubricTask?.title}</div>
            {responseForActive && responseForActive.content ? (
              <div
                className="memo-rendered"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(responseForActive.content) }}
              />
            ) : (
              <div className="text-sm text-slate-500 italic">No memo submitted for this task.</div>
            )}
            <div className="mt-3 text-xs text-slate-500">
              {responseForActive?.wordCount ?? 0} words
            </div>
          </section>

          <section className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-[10px] uppercase tracking-wider text-[#4B92DB] font-semibold">Investigation trail · Task {activeTask}</div>
            <div className="text-sm font-semibold text-[#1B2A4A] mb-3">
              {trailForActive.length} message{trailForActive.length === 1 ? "" : "s"}
            </div>
            {trailForActive.length === 0 && (
              <div className="text-sm text-slate-500 italic">No interactions for this task.</div>
            )}
            <div className="space-y-2">
              {trailForActive.map((i) => (
                <div key={i.id} className={i.actor === "candidate" ? "border-l-4 border-[#1B2A4A] pl-3" : "border-l-4 border-slate-300 pl-3"}>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    {i.actor === "candidate" ? "Candidate" : "IDSC system"} · #{i.sequenceNum}
                  </div>
                  <div className="markdown-rendered mt-0.5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{i.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <ActivitySection events={activityForActive} activeTask={activeTask} />
        </div>

        {/* Marking panel */}
        <div className="border-l border-slate-200 bg-slate-50 overflow-y-auto">
          <div className="p-5 space-y-5">
            <section className="bg-white rounded-lg border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-[#1B2A4A] mb-3">Score · Task {activeTask}</h2>
              <label className="block text-xs">
                <span className="text-slate-600">Score (out of {rubricTask?.max_marks ?? 50})</span>
                <input
                  type="number"
                  min={0}
                  max={rubricTask?.max_marks ?? 50}
                  step="0.5"
                  value={scores[activeTask]}
                  onChange={(e) => {
                    setScores((prev) => ({ ...prev, [activeTask]: e.target.value }));
                    triggerSave(activeTask);
                  }}
                  className="mt-1 block w-32 border border-slate-300 rounded-md px-3 py-1.5 text-base font-mono"
                />
              </label>
              <label className="block text-xs mt-3">
                <span className="text-slate-600">Comments / notes</span>
                <textarea
                  value={comments[activeTask]}
                  onChange={(e) => {
                    setComments((prev) => ({ ...prev, [activeTask]: e.target.value }));
                    triggerSave(activeTask);
                  }}
                  rows={6}
                  className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </label>
              <div className="mt-2 text-xs text-slate-500">
                {savingTask[activeTask] ? "Saving…" : savedAt[activeTask] ? `Saved ${new Date(savedAt[activeTask]!).toLocaleTimeString()}` : "Auto-saves on change"}
              </div>
            </section>

            {issuesForTask.length > 0 && (
              <section className="bg-white rounded-lg border border-slate-200 p-4">
                <h2 className="text-sm font-semibold text-[#1B2A4A]">Embedded issues identified</h2>
                <p className="text-xs text-slate-500 mt-1 mb-3">
                  Tick the issues this candidate identified. Used for cohort analytics — does not affect the score.
                </p>
                <div className="space-y-2">
                  {issuesForTask.map((iss) => (
                    <label key={iss.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={issues[activeTask].has(iss.id)}
                        onChange={(e) => {
                          setIssues((prev) => {
                            const next = new Set(prev[activeTask]);
                            if (e.target.checked) next.add(iss.id); else next.delete(iss.id);
                            return { ...prev, [activeTask]: next };
                          });
                          triggerSave(activeTask);
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1B2A4A] focus:ring-[#4B92DB]"
                      />
                      <span>
                        <span className="font-medium text-[#1B2A4A]">{iss.title}</span>
                        {iss.max_marks != null && <span className="text-xs text-slate-500 ml-1">({iss.max_marks}m)</span>}
                        {iss.description && <span className="block text-xs text-slate-500">{iss.description}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {rubricTask && (
              <section className="bg-white rounded-lg border border-slate-200 p-4">
                <h2 className="text-sm font-semibold text-[#1B2A4A]">Rubric reference</h2>
                <div className="mt-3 space-y-3 text-xs">
                  {Object.entries(rubricTask.categories).map(([key, cat]) => (
                    <details key={key} className="border border-slate-200 rounded-md">
                      <summary className="cursor-pointer px-3 py-1.5 bg-slate-50 text-slate-700 font-medium flex items-center justify-between">
                        <span>{key.replace(/_/g, " ")}</span>
                        <span className="font-mono">{cat.max}m</span>
                      </summary>
                      <div className="p-3 space-y-2">
                        {cat.description && <div className="text-slate-600">{cat.description}</div>}
                        {cat.descriptors && Object.entries(cat.descriptors).map(([range, text]) => (
                          <div key={range}><span className="font-mono text-slate-500">{range}:</span> {text}</div>
                        ))}
                        {cat.rubric && Object.entries(cat.rubric).map(([range, text]) => (
                          <div key={range}><span className="font-mono text-slate-500">{range}:</span> {text}</div>
                        ))}
                        {cat.indicators && (
                          <ul className="list-disc pl-4 text-slate-600">
                            {cat.indicators.map((ind, i) => <li key={i}>{ind}</li>)}
                          </ul>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Box({ loading, error }: { loading?: boolean; error?: string }) {
  return (
    <div className="max-w-3xl mx-auto p-8">
      {loading && <div className="text-sm text-slate-500">Loading…</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">{error}</div>}
    </div>
  );
}

function ActivitySection({ events, activeTask }: { events: ActivityEvent[]; activeTask: 1 | 2 }) {
  const pasteCount = events.filter((e) => e.eventType === "paste").length;
  const pasteChars = events
    .filter((e) => e.eventType === "paste")
    .reduce((sum, e) => sum + (typeof e.metadata?.charCount === "number" ? (e.metadata.charCount as number) : 0), 0);
  const hiddenCount = events.filter((e) => e.eventType === "visibility_hidden").length;
  const hiddenTotalMs = events
    .filter((e) => e.eventType === "visibility_visible")
    .reduce((sum, e) => sum + (typeof e.metadata?.hiddenMs === "number" ? (e.metadata.hiddenMs as number) : 0), 0);

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-[10px] uppercase tracking-wider text-[#4B92DB] font-semibold">Activity · Task {activeTask}</div>
      <div className="text-sm font-semibold text-[#1B2A4A] mb-3">Integrity signals</div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Pastes</div>
          <div className="text-base font-semibold text-[#1B2A4A]">
            {pasteCount}
            {pasteCount > 0 && <span className="text-xs font-normal text-slate-500"> · {pasteChars.toLocaleString()} chars</span>}
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Tab-aways</div>
          <div className="text-base font-semibold text-[#1B2A4A]">{hiddenCount}</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Time off-tab</div>
          <div className="text-base font-semibold text-[#1B2A4A]">{formatDuration(hiddenTotalMs)}</div>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="text-sm text-slate-500 italic">No activity events recorded.</div>
      ) : (
        <details>
          <summary className="cursor-pointer text-xs text-slate-600 select-none">Show event log ({events.length})</summary>
          <ol className="mt-2 space-y-1 text-xs text-slate-700 font-mono max-h-64 overflow-y-auto">
            {events.map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="text-slate-400">{new Date(e.occurredAt).toLocaleTimeString()}</span>
                <span>{formatActivityEvent(e)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function formatActivityEvent(e: ActivityEvent): string {
  const meta = e.metadata ?? {};
  if (e.eventType === "paste") {
    const target = typeof meta.target === "string" ? meta.target : "unknown";
    const chars = typeof meta.charCount === "number" ? meta.charCount : 0;
    return `paste into ${target} (${chars.toLocaleString()} chars)`;
  }
  if (e.eventType === "visibility_hidden") return "tab hidden";
  if (e.eventType === "visibility_visible") {
    const ms = typeof meta.hiddenMs === "number" ? meta.hiddenMs : 0;
    return `tab visible (after ${formatDuration(ms)})`;
  }
  return e.eventType;
}

function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return rs ? `${m}m ${rs}s` : `${m}m`;
}
