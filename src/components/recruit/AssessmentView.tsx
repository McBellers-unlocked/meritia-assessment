"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import LiveEventsOverlay from "./LiveEventsOverlay";

interface TaskCfg {
  number: number;
  title: string;
  briefMarkdown: string;
  exhibitTitle: string;
  exhibitHtml: string;
  totalMarks: number;
  deliverableLabel: string;
  deliverablePlaceholder: string;
}

interface Interaction {
  id: string;
  sequenceNum: number;
  taskNumber: number;
  timestamp: string;
  actor: string;
  content: string;
}

interface ResponseRow {
  taskNumber: number;
  content: string;
  wordCount: number;
  updatedAt: string | null;
  sentAt?: string | null;
}

export interface AssessmentInitial {
  stage: string;
  assessment: { id: string; title: string; totalMinutes: number; closeDate: string };
  scenario: {
    title: string; organisation: string; positionTitle: string; taskCount: number;
    tasks: TaskCfg[];
    // In-assessment AI branding; null/absent → IDSC defaults (existing scenarios).
    assistantName?: string | null;
    assistantShortName?: string | null;
  };
  candidate: { anonymousId: string; startedAt: string; deadline: string; submittedAt: string | null };
  responses: ResponseRow[];
  interactions: Interaction[];
}

const SAVE_DEBOUNCE_MS = 1500;
const FORCE_SAVE_INTERVAL_MS = 30_000;
// Mirrors the server-side limit in src/app/api/assess/chat/route.ts so the
// textarea refuses extra input rather than letting candidates hit a 400.
const CHAT_MAX_CHARS = 4000;

function htmlToPlainText(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined") return html.replace(/<[^>]*>/g, " ");
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent || "";
}

function wordCount(content: string): number {
  const text = htmlToPlainText(content).trim();
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

// The task brief is an in-world email — its markdown opens with
// **From:** / **To:** / **Subject:** lines. Parse those into a structured
// header so we can render a real email message view; fall back gracefully
// (whole markdown as body) when a brief doesn't follow the convention.
const BRIEF_STOPWORDS = new Set(["of", "and", "the", "for", "to", "a", "an", "in", "on", "you"]);
function initialsFrom(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[a-z]/i.test(w[0] ?? "") && !BRIEF_STOPWORDS.has(w.toLowerCase()));
  if (words.length === 0) return name.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase() || "··";
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}
function parseBriefEmail(md: string): { from: string | null; to: string | null; cc: string | null; subject: string | null; sent: string | null; body: string } {
  const out: { from: string | null; to: string | null; cc: string | null; subject: string | null; sent: string | null; body: string } = {
    from: null, to: null, cc: null, subject: null, sent: null, body: md,
  };
  const lines = md.split(/\r?\n/);
  let consumed = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") {
      consumed = i + 1;
      if (out.from || out.to || out.cc || out.subject || out.sent) break; // blank line ends the header block
      continue;
    }
    const m = line.match(/^\*\*\s*(From|To|Cc|Subject|Sent|Date)\s*:\*\*\s*(.*)$/i);
    if (!m) break; // first non-meta, non-blank line — body starts here
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "from") out.from = val;
    else if (key === "to") out.to = val;
    else if (key === "cc") out.cc = val;
    else if (key === "subject") out.subject = val;
    else out.sent = val; // "Sent" or "Date"
    consumed = i + 1;
  }
  if (out.from || out.to || out.subject) out.body = lines.slice(consumed).join("\n").trim();
  return out;
}

export default function AssessmentView({
  token, initial, onReload,
}: {
  token: string;
  initial: AssessmentInitial;
  onReload: () => Promise<void> | void;
}) {
  const tasks = initial.scenario.tasks;
  const [activeTask, setActiveTask] = useState<number>(1);
  const activeTaskCfg = tasks.find((t) => t.number === activeTask) ?? tasks[0];

  // In-assessment AI branding. Falls back to the IDSC defaults so the
  // existing built-ins (FAM/CSO/APLO) render exactly as before; scenarios set
  // in a different organisation (e.g. IPAC) carry their own brand.
  const assistantName = initial.scenario.assistantName || "IDSC Knowledge System";
  const assistantShort = initial.scenario.assistantShortName || "IDSC";

  // Per-task chat input + memo (drafts in client state, autosaved to server)
  const [chatInputs, setChatInputs] = useState<Record<number, string>>({ 1: "", 2: "" });
  const [memos, setMemos] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = { 1: "", 2: "" };
    for (const r of initial.responses) m[r.taskNumber] = r.content;
    return m;
  });
  const [savedAt, setSavedAt] = useState<Record<number, string | null>>(() => {
    const s: Record<number, string | null> = { 1: null, 2: null };
    for (const r of initial.responses) s[r.taskNumber] = r.updatedAt;
    return s;
  });
  const [memoSaving, setMemoSaving] = useState<Record<number, boolean>>({ 1: false, 2: false });
  // Per-memo "sent" timestamps — the candidate's explicit finalise + advance.
  const [memoSentAt, setMemoSentAt] = useState<Record<number, string | null>>(() => {
    const s: Record<number, string | null> = {};
    for (const r of initial.responses) s[r.taskNumber] = r.sentAt ?? null;
    return s;
  });
  const [sendingMemo, setSendingMemo] = useState<number | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>(initial.interactions);

  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(true);
  const [exhibitFullscreen, setExhibitFullscreen] = useState(false);
  const submittedRef = useRef(false);
  const chatScroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = chatScroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [interactions, sending, activeTask]);

  /* ------ tabbed layout + persistent IDSC sidebar ------ */
  // Candidates pick a view tab (Exhibit | Memo) to focus on. The IDSC
  // Knowledge System sits in a permanent right-edge sidebar — open by default
  // so it's discoverable, collapsible to a 48px rail when they want more
  // room for writing. Tab + collapse state persist in localStorage (v3).
  const [activeView, setActiveView] = useState<"exhibit" | "memo" | "split">("exhibit");
  const [idscCollapsed, setIdscCollapsed] = useState(false);
  const [hasUnreadAI, setHasUnreadAI] = useState(false);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

  /* ------ activity / integrity logger ------ */
  // Buffers paste + visibility-change events and flushes them to
  // /api/assess/activity in small batches. Content of pastes is NOT captured;
  // only character count. Surfaced to examiners during marking.
  const activityBuffer = useRef<
    Array<{ type: string; taskNumber: number | null; metadata: unknown; occurredAt: string }>
  >([]);
  const activityFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTaskRef = useRef(activeTask);
  useEffect(() => { activeTaskRef.current = activeTask; }, [activeTask]);

  const flushActivity = useCallback(async () => {
    if (activityBuffer.current.length === 0) return;
    const events = activityBuffer.current.splice(0);
    try {
      await fetch("/api/assess/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, events }),
        keepalive: true,
      });
    } catch {
      // Integrity logging is best-effort — never block the candidate.
    }
  }, [token]);

  const logActivity = useCallback((type: string, metadata?: unknown) => {
    activityBuffer.current.push({
      type,
      taskNumber: activeTaskRef.current,
      metadata: metadata ?? null,
      occurredAt: new Date().toISOString(),
    });
    if (activityFlushTimerRef.current) clearTimeout(activityFlushTimerRef.current);
    activityFlushTimerRef.current = setTimeout(() => { void flushActivity(); }, 1500);
  }, [flushActivity]);

  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        logActivity("visibility_hidden");
      } else if (hiddenAt) {
        const hiddenMs = Date.now() - hiddenAt;
        hiddenAt = 0;
        logActivity("visibility_visible", { hiddenMs });
      }
    };
    const onPageHide = () => { void flushActivity(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [logActivity, flushActivity]);

  // Hydrate + persist layout prefs. v3 schema replaces v2 (which described a
  // resizable two-panel layout); now just two pieces of state — the active
  // view tab and whether the IDSC sidebar is collapsed.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("fam-layout-v3");
      if (raw) {
        const p = JSON.parse(raw);
        if (p.activeView === "exhibit" || p.activeView === "memo" || p.activeView === "split") setActiveView(p.activeView);
        if (typeof p.idscCollapsed === "boolean") setIdscCollapsed(p.idscCollapsed);
        return;
      }
    } catch { /* ignore */ }
    // First visit: collapse IDSC by default on narrow viewports so a
    // full-width sidebar doesn't cover the assessment on mobile.
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setIdscCollapsed(true);
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("fam-layout-v3", JSON.stringify({ activeView, idscCollapsed }));
    } catch { /* ignore */ }
  }, [activeView, idscCollapsed]);

  // Toggle the IDSC sidebar; expanding clears the unread badge and focuses
  // the input so candidates can type immediately.
  const toggleIdsc = useCallback(() => {
    setIdscCollapsed((c) => !c);
  }, []);
  useEffect(() => {
    if (!idscCollapsed) {
      setHasUnreadAI(false);
      const id = window.setTimeout(() => chatInputRef.current?.focus(), 140);
      return () => window.clearTimeout(id);
    }
  }, [idscCollapsed]);

  // Cmd/Ctrl+J toggles the sidebar — same shortcut as the previous drawer
  // and the VSCode terminal convention.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "j") {
        ev.preventDefault();
        toggleIdsc();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleIdsc]);

  // Flash the rail when an AI reply arrives while the sidebar is collapsed.
  const prevAiCountRef = useRef(initial.interactions.filter((i) => i.actor === "ai").length);
  useEffect(() => {
    const aiCount = interactions.filter((i) => i.actor === "ai").length;
    if (aiCount > prevAiCountRef.current && idscCollapsed) {
      setHasUnreadAI(true);
    }
    prevAiCountRef.current = aiCount;
  }, [interactions, idscCollapsed]);

  /* ------ chat ------ */
  const sendMessage = useCallback(async () => {
    const message = (chatInputs[activeTask] || "").trim();
    if (!message || sending) return;
    setSending(true); setChatError(null);
    const optimistic: Interaction = {
      id: `opt-${Date.now()}`,
      sequenceNum: (interactions[interactions.length - 1]?.sequenceNum ?? 0) + 1,
      taskNumber: activeTask,
      timestamp: new Date().toISOString(),
      actor: "candidate",
      content: message,
    };
    setInteractions((prev) => [...prev, optimistic]);
    setChatInputs((prev) => ({ ...prev, [activeTask]: "" }));
    try {
      const res = await fetch("/api/assess/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, taskNumber: activeTask, message }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      // Replace this task's interactions with server view; keep other task's intact
      setInteractions((prev) => [
        ...prev.filter((p) => p.taskNumber !== activeTask),
        ...(body.trail as Interaction[]),
      ]);
    } catch (e) {
      setChatError((e as Error).message);
      setInteractions((prev) => prev.filter((p) => p.id !== optimistic.id));
      setChatInputs((prev) => ({ ...prev, [activeTask]: message }));
    } finally {
      setSending(false);
    }
  }, [chatInputs, activeTask, sending, interactions, token]);

  /* ------ memo autosave (debounced + 30s force) ------ */
  const saveMemo = useCallback(async (taskNumber: number, content: string) => {
    setMemoSaving((s) => ({ ...s, [taskNumber]: true }));
    try {
      const res = await fetch("/api/assess/memo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, taskNumber, content }),
      });
      if (res.ok) {
        const body = await res.json();
        setSavedAt((s) => ({ ...s, [taskNumber]: body.updatedAt }));
      }
    } finally {
      setMemoSaving((s) => ({ ...s, [taskNumber]: false }));
    }
  }, [token]);

  /* ------ per-memo "Send" + advance to the next memo ------ */
  const sendMemo = useCallback(async (taskNumber: number) => {
    setSendingMemo(taskNumber);
    setSendError(null);
    try {
      // Persist the latest draft before finalising it.
      await saveMemo(taskNumber, memos[taskNumber] || "");
      const res = await fetch("/api/assess/memo/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, taskNumber }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setMemoSentAt((s) => ({ ...s, [taskNumber]: body.sentAt }));
      // Move on to the next memo ("next email"), if there is one.
      const next = tasks.find((t) => t.number > taskNumber);
      if (next) setActiveTask(next.number);
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setSendingMemo(null);
    }
  }, [token, memos, tasks, saveMemo]);

  // Debounce per task
  const memoTimers = useRef<Record<number, ReturnType<typeof setTimeout> | null>>({ 1: null, 2: null });
  useEffect(() => {
    const t = activeTask;
    if (memoTimers.current[t]) clearTimeout(memoTimers.current[t] as any);
    memoTimers.current[t] = setTimeout(() => void saveMemo(t, memos[t] || ""), SAVE_DEBOUNCE_MS);
    return () => {
      if (memoTimers.current[t]) clearTimeout(memoTimers.current[t] as any);
    };
  }, [memos, activeTask, saveMemo]);

  // Force-save every 30s for both tasks
  useEffect(() => {
    const id = setInterval(() => {
      void saveMemo(1, memos[1] || "");
      void saveMemo(2, memos[2] || "");
    }, FORCE_SAVE_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memos[1], memos[2]]);

  /* ------ submit ------ */
  const submit = useCallback(async () => {
    if (submitting || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      // Final flush of both memos
      await Promise.all([saveMemo(1, memos[1] || ""), saveMemo(2, memos[2] || "")]);
      const res = await fetch("/api/assess/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await onReload(); // parent flips to Submitted view
    } catch (e) {
      setChatError(`Submit failed: ${(e as Error).message}`);
      submittedRef.current = false;
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }, [submitting, memos, token, saveMemo, onReload]);

  /* ------ timer ------ */
  const timer = useTimer(initial.candidate.deadline, initial.assessment.totalMinutes);
  // Auto-submit on expiry
  useEffect(() => {
    if (timer.expired && !submittedRef.current) {
      void submit();
    }
  }, [timer.expired, submit]);

  const wordCounts = useMemo(() => {
    const wc: Record<number, number> = {};
    for (const t of tasks) wc[t.number] = wordCount(memos[t.number] || "");
    return wc;
  }, [memos, tasks]);

  const trailForActive = interactions.filter((i) => i.taskNumber === activeTask);

  return (
    <div className="min-h-screen text-uq font-sans flex flex-col">
      {/* Header */}
      <header className="bg-uq-glass-strong backdrop-blur-xl border-b border-uq-faint shadow-uq-e1 flex-shrink-0">
        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/logos/uniqassess-logo.png"
                alt="UNIQAssess"
                width={140}
                height={38}
                className="h-7 w-auto"
              />
            </span>
            <span className="text-uq-3 hidden sm:inline">|</span>
            <div className="text-sm min-w-0">
              <div className="font-semibold tracking-[-0.005em] text-uq truncate">
                {initial.scenario.positionTitle}
              </div>
              <div className="font-mono text-[11px] tracking-[0.04em] text-uq-2 truncate">
                {initial.scenario.organisation} · {initial.candidate.anonymousId}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <TaskTabs
              tasks={tasks}
              active={activeTask}
              onSwitch={setActiveTask}
              wordCounts={wordCounts}
            />
            <TimerPill timer={timer} />
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={submitting}
              className="px-4 py-1.5 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium tracking-[-0.005em] shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting…" : "Submit assessment"}
            </button>
          </div>
        </div>
      </header>

      {/* Layout body.
          - Main column: a [Exhibit] / [Memo] tab bar above whichever view is
            active. Candidates focus on one at a time; a "Peek at exhibit"
            button on the Memo tab opens the existing fullscreen exhibit modal
            so they can quickly check source data without losing their place.
          - IDSC Knowledge System: a permanent right-edge sidebar, open by
            default so it's discoverable. Collapses to a 48px rail (the same
            shape the previous design used for the chat rail). */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        <main
          className={`flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden transition-[padding] duration-200 ${
            idscCollapsed ? "pr-12" : "pr-0 lg:pr-[420px]"
          }`}
        >
          {/* View switch — a pill segmented control. Split renders the source
              exhibit and the memo editor side-by-side so candidates can read
              while they write (the #1 navigation need on an analytical task). */}
          <div className="bg-uq-bg2 border-b border-uq-faint flex-shrink-0 flex items-center px-3 py-2">
            <div className="inline-flex items-center gap-1 rounded-lg bg-uq-elev2 p-1">
              <ViewTab
                active={activeView === "exhibit"}
                onClick={() => setActiveView("exhibit")}
                label="Exhibit"
                sublabel={activeTaskCfg.exhibitTitle}
              />
              <ViewTab
                active={activeView === "split"}
                onClick={() => setActiveView("split")}
                label="Split"
                sublabel="Exhibit + memo, side by side"
              />
              <ViewTab
                active={activeView === "memo"}
                onClick={() => setActiveView("memo")}
                label="Memo"
                sublabel={`${wordCounts[activeTask]} ${wordCounts[activeTask] === 1 ? "word" : "words"}${memoSaving[activeTask] ? " · saving…" : ""}`}
                warn={wordCounts[activeTask] === 0}
              />
            </div>
          </div>

          {/* Brief — rendered as the in-world email it is (from the Chief of
              MS Division). Shared across every view so the task framing is
              always one click away, never hidden inside the memo. */}
          {(() => {
            const brief = parseBriefEmail(activeTaskCfg.briefMarkdown);
            const sender = brief.from ?? "Task brief";
            return (
              <div className="border-b border-uq-faint bg-uq-elev1 flex-shrink-0">
                <button
                  onClick={() => setBriefOpen((v) => !v)}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-uq-elev2 transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
                  aria-expanded={briefOpen}
                >
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 shadow-uq-e1"
                    style={{ backgroundImage: "linear-gradient(135deg, var(--uq-accent), var(--uq-persona))" }}
                    aria-hidden
                  >
                    {brief.from ? initialsFrom(brief.from) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 6v1h18v-1c0-3.5-4-6-9-6z" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-uq truncate">{sender}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-uq-3 flex-shrink-0 hidden sm:inline">Brief · Task {activeTask}</span>
                    </span>
                    <span className="block text-xs text-uq-2 truncate">{brief.subject ?? activeTaskCfg.title}</span>
                  </span>
                  {brief.sent && (
                    <span className="font-mono text-[10px] text-uq-3 flex-shrink-0 hidden md:inline whitespace-nowrap">{brief.sent}</span>
                  )}
                  <span className="font-mono text-[11px] text-uq-3 flex-shrink-0">{briefOpen ? "Hide" : "Show"}</span>
                </button>
                {briefOpen && (
                  <div className="px-4 pb-4 max-h-72 overflow-y-auto uq-fade-rise">
                    <div className="text-xs space-y-0.5 pb-2">
                      {brief.from && <div className="text-uq-3"><span className="inline-block w-11 align-top">From</span><span className="text-uq-2">{brief.from}</span></div>}
                      {brief.to && <div className="text-uq-3"><span className="inline-block w-11 align-top">To</span><span className="text-uq-2">{brief.to}</span></div>}
                      {brief.cc && <div className="text-uq-3"><span className="inline-block w-11 align-top">Cc</span><span className="text-uq-2">{brief.cc}</span></div>}
                      {brief.sent && <div className="text-uq-3"><span className="inline-block w-11 align-top">Sent</span><span className="text-uq-2">{brief.sent}</span></div>}
                    </div>
                    {brief.subject && (
                      <div className="border-t border-uq-faint pt-2 pb-1">
                        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-uq-3">Subject</div>
                        <div className="text-base font-semibold tracking-[-0.005em] text-uq">{brief.subject}</div>
                      </div>
                    )}
                    <div className="border-t border-uq-faint pt-3 mt-1 text-sm text-uq-2 leading-relaxed">
                      <MarkdownView>{brief.body}</MarkdownView>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Active content — one pane, or both side-by-side in Split (stacks
              on narrow screens). Sections are keyed so the memo editor instance
              survives toggling the exhibit on/off in Split. */}
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
            {(activeView === "exhibit" || activeView === "split") && (
              <section
                key="exhibit-pane"
                className={`bg-uq-elev1 uq-fade-rise flex flex-col min-h-0 overflow-hidden flex-1 ${
                  activeView === "split" ? "border-b lg:border-b-0 lg:border-r border-uq" : ""
                }`}
              >
                <div className="px-4 py-2 border-b border-uq-faint bg-uq-glass-subtle backdrop-blur-md flex-shrink-0 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-accent">
                      Exhibit · Task {activeTask}
                    </div>
                    <div className="text-sm font-semibold tracking-[-0.005em] text-uq truncate">
                      {activeTaskCfg.exhibitTitle}
                    </div>
                  </div>
                  <button
                    onClick={() => setExhibitFullscreen(true)}
                    className="px-3 py-1.5 rounded-md border border-uq-strong text-uq-2 text-xs font-medium transition-colors hover:border-uq-accent hover:bg-uq-elev2 hover:text-uq flex-shrink-0 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
                    title="Open exhibit full screen"
                  >
                    ⤢ Expand
                  </button>
                </div>
                <iframe
                  srcDoc={activeTaskCfg.exhibitHtml}
                  sandbox=""
                  className="flex-1 w-full border-0 bg-white"
                  title={activeTaskCfg.exhibitTitle}
                />
              </section>
            )}
            {(activeView === "memo" || activeView === "split") && (
              <section
                key="memo-pane"
                className="bg-uq-elev1 uq-fade-rise flex flex-col min-h-0 overflow-hidden flex-1"
              >
                {/* Memo header — title + (single-view only) Peek at exhibit. */}
                <div className="px-4 py-2 border-b border-uq-faint bg-uq-glass-subtle backdrop-blur-md flex-shrink-0 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-accent">
                      Your deliverable · Task {activeTask}
                    </div>
                    <div className="text-sm font-semibold tracking-[-0.005em] text-uq truncate">
                      {activeTaskCfg.deliverableLabel}
                    </div>
                  </div>
                  {activeView !== "split" && (
                    <button
                      type="button"
                      onClick={() => setExhibitFullscreen(true)}
                      className="px-3 py-1.5 rounded-md border border-uq-strong text-uq-2 text-xs font-medium transition-colors hover:border-uq-accent hover:bg-uq-elev2 hover:text-uq flex-shrink-0 inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
                      title="Open the exhibit full screen — close it to return to the memo"
                      aria-label="Peek at exhibit"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Peek at exhibit
                    </button>
                  )}
                </div>

                <MemoEditor
                  key={activeTask}
                  initialContent={memos[activeTask] || ""}
                  placeholder={activeTaskCfg.deliverablePlaceholder}
                  onChange={(html) => setMemos((prev) => ({ ...prev, [activeTask]: html }))}
                  onPasteCapture={(charCount) => logActivity("paste", { target: "memo", charCount })}
                />

                <div className="px-4 py-2 border-t border-uq-faint bg-uq-glass-subtle text-xs text-uq-3 flex items-center justify-between gap-3 flex-shrink-0">
                  <div className="flex items-center gap-3 min-w-0 flex-wrap">
                    <span className="font-mono tabular-nums text-uq-2">{wordCounts[activeTask]} words</span>
                    <span className="font-mono tabular-nums">
                      {memoSaving[activeTask]
                        ? "Saving…"
                        : savedAt[activeTask]
                        ? `Saved ${new Date(savedAt[activeTask]!).toLocaleTimeString()}`
                        : "Not yet saved"}
                    </span>
                    {memoSentAt[activeTask] && (
                      <span className="font-mono text-[color:var(--uq-success-text)] whitespace-nowrap">✓ Sent {new Date(memoSentAt[activeTask]!).toLocaleTimeString()}</span>
                    )}
                  </div>
                  {(() => {
                    const hasNext = !!tasks.find((t) => t.number > activeTask);
                    const sent = !!memoSentAt[activeTask];
                    return (
                      <button
                        type="button"
                        onClick={() => void sendMemo(activeTask)}
                        disabled={sendingMemo === activeTask || (wordCounts[activeTask] ?? 0) === 0}
                        className="px-3 py-1.5 rounded-md bg-uq-accent text-[color:var(--uq-text-on-accent)] text-xs font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] flex-shrink-0"
                        title={hasNext ? "Send this memo and move to the next" : "Send this memo"}
                      >
                        {sendingMemo === activeTask
                          ? "Sending…"
                          : sent
                          ? (hasNext ? "Re-send & next →" : "Re-send")
                          : (hasNext ? "Send & next →" : "Send memo")}
                      </button>
                    );
                  })()}
                </div>
                {sendError && (
                  <div className="px-4 py-1.5 text-xs text-uq-danger-text bg-uq-danger-soft border-t border-uq-danger-line flex-shrink-0">{sendError}</div>
                )}
              </section>
            )}
          </div>
        </main>

        {/* IDSC Knowledge System — always anchored to the right edge.
            Collapsed: 48px rail (mirrors the previous chat-rail pattern).
            Expanded: 420px panel on lg+, full-width overlay on smaller. */}
        {idscCollapsed ? (
          <button
            type="button"
            onClick={toggleIdsc}
            className="absolute right-0 top-0 bottom-0 w-12 flex flex-col items-center justify-between py-3 text-uq-2 transition-colors border-l border-uq z-10 bg-uq-glass-strong backdrop-blur-xl hover:bg-uq-elev2 hover:text-uq focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            aria-label={`Expand ${assistantShort} AI assistant (Ctrl/Cmd+J)`}
            aria-expanded={false}
            title={`${assistantShort} AI assistant — Ctrl/Cmd+J`}
          >
            <div className="flex flex-col items-center gap-1.5">
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.26-.97L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-uq-accent">Ask AI</span>
            </div>
            <div className="flex-1 flex items-center justify-center px-1">
              <span
                className="font-mono text-[11px] uppercase tracking-[0.18em] text-uq-2 whitespace-nowrap"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                {assistantShort} · AI ASSISTANT
              </span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="font-mono text-[10px] tabular-nums text-uq-2">
                {trailForActive.length}
              </span>
              {hasUnreadAI && (
                <span
                  className="w-2 h-2 rounded-full bg-uq-accent animate-uq-pulse-glow"
                  aria-label="New AI reply"
                  title="New reply"
                />
              )}
            </div>
          </button>
        ) : (
          <aside
            className="absolute right-0 top-0 bottom-0 bg-uq-glass-strong backdrop-blur-xl border-l border-uq flex flex-col z-10 w-full lg:w-[420px] shadow-uq-glass lg:shadow-uq-glass"
            aria-label={`${assistantShort} AI assistant chat`}
          >
            <div className="px-4 py-2.5 border-b border-uq-faint bg-uq-glass-subtle flex-shrink-0 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2.5">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-uq-e1"
                  style={{ backgroundImage: "linear-gradient(135deg, var(--uq-accent), var(--uq-persona))" }}
                  aria-hidden
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white/90" />
                </span>
                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-accent">
                    AI Assistant · Task {activeTask}
                  </div>
                  <div className="text-sm font-semibold tracking-[-0.005em] text-uq truncate">
                    {assistantName}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleIdsc}
                className="text-uq-3 hover:text-uq w-8 h-8 rounded-md hover:bg-uq-elev2 flex items-center justify-center flex-shrink-0 transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
                aria-label={`Collapse ${assistantShort} sidebar (Ctrl/Cmd+J)`}
                title="Collapse — Ctrl/Cmd+J"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <div ref={chatScroller} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
              {trailForActive.length === 0 && (
                <div className="text-xs text-uq-3 italic">
                  Ask the {assistantShort} AI anything. Be specific — request source documents, underlying data,
                  or detail on a particular item. It won&apos;t write your answer or tell you what to conclude — the
                  analysis and the writing are yours. Every question you ask forms part of the assessment.
                </div>
              )}
              {trailForActive.map((i) => <ChatBubble key={i.id} entry={i} />)}
              {sending && (
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className="w-5 h-5 rounded-full flex-shrink-0 shadow-uq-e1"
                    style={{ backgroundImage: "linear-gradient(135deg, var(--uq-accent), var(--uq-persona))" }}
                    aria-hidden
                  />
                  <span className="uq-shimmer-text font-medium">{assistantShort} is thinking…</span>
                </div>
              )}
            </div>

            {chatError && (
              <div className="px-4 py-2 border-t border-uq-danger-line bg-uq-danger-soft text-uq-danger-text text-xs">{chatError}</div>
            )}

            <div className="border-t border-uq-faint p-3 flex-shrink-0">
              <textarea
                ref={chatInputRef}
                value={chatInputs[activeTask] || ""}
                onChange={(e) => setChatInputs((prev) => ({ ...prev, [activeTask]: e.target.value }))}
                onPaste={(e) => {
                  const txt = e.clipboardData.getData("text") ?? "";
                  if (txt.length > 0) logActivity("paste", { target: "chat", charCount: txt.length });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={`Ask the ${assistantName}… (Ctrl/Cmd ⏎ to send)`}
                className="w-full h-20 text-sm rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1 resize-none"
                maxLength={CHAT_MAX_CHARS}
                disabled={sending}
              />
              {(() => {
                const len = (chatInputs[activeTask] || "").length;
                const nearLimit = len >= CHAT_MAX_CHARS * 0.9;
                const atLimit = len >= CHAT_MAX_CHARS;
                const counterClass = atLimit
                  ? "font-mono text-uq-danger-text font-medium tabular-nums"
                  : nearLimit
                  ? "font-mono text-uq-warn-text font-medium tabular-nums"
                  : "font-mono text-uq-3 tabular-nums";
                return (
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className={counterClass}>
                      {len.toLocaleString()} / {CHAT_MAX_CHARS.toLocaleString()}
                      {atLimit && <span className="ml-1.5 font-normal">character limit reached</span>}
                    </span>
                    <button
                      onClick={() => void sendMessage()}
                      disabled={!(chatInputs[activeTask] || "").trim() || sending}
                      className="px-3 py-1.5 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-xs font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed"
                    >
                      {sending ? "Sending…" : "Send"}
                    </button>
                  </div>
                );
              })()}
            </div>
          </aside>
        )}
      </div>

      {/* Fullscreen exhibit modal */}
      {exhibitFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-[#16181D]/40 backdrop-blur-sm flex flex-col p-3"
          onClick={() => setExhibitFullscreen(false)}
        >
          <div
            className="bg-uq-elev3 rounded-2xl border border-uq-strong shadow-uq-pop animate-uq-rise flex flex-col h-full w-full max-w-6xl mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-uq-faint bg-uq-glass-subtle flex items-center justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-accent">
                  Exhibit · Task {activeTask}
                </div>
                <div className="text-base font-semibold tracking-[-0.005em] text-uq">{activeTaskCfg.exhibitTitle}</div>
              </div>
              <button
                onClick={() => setExhibitFullscreen(false)}
                className="text-uq-3 hover:text-uq text-2xl w-9 h-9 rounded-full hover:bg-uq-elev2 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <iframe
              srcDoc={activeTaskCfg.exhibitHtml}
              sandbox=""
              className="flex-1 w-full border-0 rounded-b-2xl bg-white"
              title={activeTaskCfg.exhibitTitle}
            />
          </div>
        </div>
      )}

      {/* Submit modal */}
      {confirmOpen && (() => {
        const memoTaskNums = tasks.map((t) => t.number);
        const interactionCounts: Record<number, number> = {};
        for (const n of memoTaskNums) {
          interactionCounts[n] = interactions.filter((i) => i.taskNumber === n && i.actor === "candidate").length;
        }
        const flags: { task: number; kind: "empty-memo" | "short-memo" | "no-ai" | "not-sent"; label: string }[] = [];
        memoTaskNums.forEach((t) => {
          if ((wordCounts[t] ?? 0) === 0) {
            flags.push({ task: t, kind: "empty-memo", label: `Task ${t} memo is empty` });
          } else if ((wordCounts[t] ?? 0) < 50) {
            flags.push({ task: t, kind: "short-memo", label: `Task ${t} memo is very short (${wordCounts[t]} words)` });
          } else if (!memoSentAt[t]) {
            flags.push({ task: t, kind: "not-sent", label: `Task ${t} memo hasn't been sent` });
          }
          if ((interactionCounts[t] ?? 0) === 0) {
            flags.push({ task: t, kind: "no-ai", label: `You have not used the AI system on Task ${t}` });
          }
        });
        const hasCritical = flags.some((f) => f.kind === "empty-memo" || f.kind === "no-ai");
        return (
          <div
            className="fixed inset-0 z-50 bg-[#16181D]/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setConfirmOpen(false)}
          >
            <div className="rounded-2xl border border-uq-strong bg-uq-elev3 shadow-uq-pop animate-uq-rise max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold tracking-[-0.005em] text-uq">Submit assessment?</h3>
              <p className="text-sm text-uq-2 mt-2 leading-relaxed">
                This assessment has <strong>{memoTaskNums.length === 2 ? "two" : memoTaskNums.length} {memoTaskNums.length === 1 ? "task" : "tasks"}</strong>. You will not be able to return
                to this assessment or modify your responses after submission.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {memoTaskNums.map((t) => (
                  <div
                    key={t}
                    className={`rounded-xl p-3 ${
                      (wordCounts[t] ?? 0) === 0 || (interactionCounts[t] ?? 0) === 0
                        ? "border border-uq-danger-line bg-uq-danger-soft"
                        : "border border-uq bg-uq-glass-subtle"
                    }`}
                  >
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-uq-3">Task {t}</div>
                    <div className="font-semibold font-mono text-uq">
                      {wordCounts[t] ?? 0} words
                      <span className="text-xs font-normal text-uq-3 ml-1">memo</span>
                    </div>
                    <div className="font-mono text-xs text-uq-2 tabular-nums mt-1">
                      {interactionCounts[t] ?? 0} AI {interactionCounts[t] === 1 ? "question" : "questions"}
                    </div>
                    <div className="font-mono text-[10px] tabular-nums mt-1">
                      {memoSentAt[t]
                        ? <span className="text-[color:var(--uq-success-text)]">✓ sent</span>
                        : <span className="text-uq-3">not sent</span>}
                    </div>
                  </div>
                ))}
              </div>
              {flags.length > 0 && (
                <div
                  className={`mt-3 text-xs rounded-xl p-3 border ${
                    hasCritical
                      ? "text-uq-danger-text bg-uq-danger-soft border-uq-danger-line"
                      : "text-uq-warn-text bg-uq-warn-soft border-uq-warn-line"
                  }`}
                >
                  <div className="font-semibold mb-1">
                    {hasCritical ? "Please review before submitting:" : "Heads up:"}
                  </div>
                  <ul className="space-y-1">
                    {flags.map((f, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTask(f.task);
                            setConfirmOpen(false);
                          }}
                          className="w-full text-left flex items-start gap-2 px-2 py-1 rounded-md hover:bg-uq-elev2 transition-colors group focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
                        >
                          <span className="opacity-60 mt-0.5 leading-tight">•</span>
                          <span className="flex-1">{f.label}</span>
                          <span className="font-medium underline text-uq-accent opacity-90 group-hover:opacity-100 whitespace-nowrap">
                            Take me to Task {f.task} →
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="px-4 py-2 rounded-lg border border-uq-strong bg-uq-glass-subtle text-uq text-sm font-medium transition-colors hover:border-uq-accent hover:bg-uq-accent-soft hover:text-uq focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void submit()}
                  disabled={submitting}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] ${
                    hasCritical
                      ? "border border-uq-danger-line bg-uq-danger-soft text-uq-danger-text hover:border-uq-danger"
                      : "bg-uq-accent text-[color:var(--uq-text-on-accent)] shadow-uq-glow-soft hover:bg-uq-accent-hover hover:shadow-uq-glow"
                  }`}
                >
                  {submitting ? "Submitting…" : hasCritical ? "Submit anyway" : "Submit"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/*
        Scripted-events overlay — renders an inbox drawer + persona chat
        popup for scenarios that include email_inbox / chat tasks. Polls
        /api/assess/events on a ~7s cadence. Legacy memo-only scenarios
        (fam-p4-2026) produce no events, so the overlay is inert there.
      */}
      <LiveEventsOverlay token={token} active={!initial.candidate.submittedAt} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ChatBubble({ entry }: { entry: Interaction }) {
  const isUser = entry.actor === "candidate";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? "rounded-2xl rounded-br-md bg-uq-accent text-[color:var(--uq-text-on-accent)] whitespace-pre-wrap"
            : "rounded-2xl rounded-bl-md bg-uq-elev2 border border-uq text-uq"
        }`}
      >
        {isUser ? entry.content : <MarkdownView>{entry.content}</MarkdownView>}
      </div>
    </div>
  );
}

// Lightweight markdown renderer for AI output and memo preview.
// Uses remark-gfm so tables, strikethrough, task lists, and autolinks work.
export function MarkdownView({ children }: { children: string }) {
  return (
    <div className="markdown-view">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="text-base font-bold mt-3 mb-1.5">{p.children}</h1>,
          h2: (p) => <h2 className="text-sm font-bold mt-3 mb-1.5">{p.children}</h2>,
          h3: (p) => <h3 className="text-sm font-semibold mt-2.5 mb-1">{p.children}</h3>,
          h4: (p) => <h4 className="text-xs font-semibold uppercase tracking-wider text-uq-2 mt-2 mb-1">{p.children}</h4>,
          p: (p) => <p className="mb-2 last:mb-0 leading-relaxed">{p.children}</p>,
          ul: (p) => <ul className="list-disc pl-5 mb-2 space-y-0.5 last:mb-0">{p.children}</ul>,
          ol: (p) => <ol className="list-decimal pl-5 mb-2 space-y-0.5 last:mb-0">{p.children}</ol>,
          li: (p) => <li className="leading-relaxed">{p.children}</li>,
          strong: (p) => <strong className="font-semibold">{p.children}</strong>,
          em: (p) => <em className="italic">{p.children}</em>,
          hr: () => <hr className="my-3 border-uq" />,
          blockquote: (p) => (
            <blockquote className="border-l-4 border-uq-accent pl-3 italic my-2 text-uq-2">
              {p.children}
            </blockquote>
          ),
          code: ({ className, children, ...rest }: any) => {
            const isBlock = /language-/.test(className || "");
            return isBlock ? (
              <code className={`${className} block`} {...rest}>
                {children}
              </code>
            ) : (
              <code className="bg-uq-glass-subtle border border-uq-faint text-uq-cyan px-1 py-0.5 rounded text-[0.85em] font-mono" {...rest}>
                {children}
              </code>
            );
          },
          pre: (p) => (
            <pre className="bg-uq-elev2 border border-uq text-uq text-xs rounded-lg p-2.5 overflow-x-auto my-2 font-mono">
              {p.children}
            </pre>
          ),
          table: (p) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border-collapse text-xs">{p.children}</table>
            </div>
          ),
          thead: (p) => <thead className="bg-uq-glass-subtle">{p.children}</thead>,
          th: (p) => (
            <th className="border border-uq px-2 py-1 text-left font-semibold">
              {p.children}
            </th>
          ),
          td: (p) => <td className="border border-uq px-2 py-1 align-top">{p.children}</td>,
          a: (p) => (
            <a className="text-uq-accent underline hover:no-underline" target="_blank" rel="noreferrer" {...(p as any)}>
              {p.children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function TaskTabs({
  tasks, active, onSwitch, wordCounts,
}: {
  tasks: TaskCfg[];
  active: number;
  onSwitch: (n: number) => void;
  wordCounts: Record<number, number>;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-uq-elev2 p-1">
      {tasks.map((t) => {
        const isActive = active === t.number;
        const shortTitle = t.title.split("&")[0].trim();
        const empty = (wordCounts[t.number] ?? 0) === 0;
        return (
          <button
            key={t.number}
            onClick={() => onSwitch(t.number)}
            aria-pressed={isActive}
            className={[
              "px-3 py-1.5 rounded-md text-xs transition-all duration-150 flex items-center gap-1.5 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]",
              isActive
                ? "bg-uq-elev1 text-uq shadow-uq-e1"
                : "text-uq-2 hover:text-uq",
            ].join(" ")}
            title={`Task ${t.number} of ${tasks.length}: ${t.title}`}
          >
            <span className="font-semibold">
              Task {t.number}
              <span className="opacity-50 font-normal">/{tasks.length}</span>
            </span>
            <span className="hidden lg:inline opacity-70 truncate max-w-[120px] font-medium">
              {shortTitle}
            </span>
            <span className="font-mono text-[10px] tabular-nums text-uq-3">{wordCounts[t.number]}w</span>
            {!isActive && empty && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-uq-danger flex-shrink-0"
                title="No memo content yet"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function ViewTab({
  active, onClick, label, sublabel, warn,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sublabel?: string;
  warn?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={sublabel}
      className={[
        "px-3.5 py-1.5 rounded-md text-sm font-medium inline-flex items-center gap-1.5 transition-all duration-150 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]",
        active
          ? "bg-uq-elev1 text-uq shadow-uq-e1"
          : "text-uq-2 hover:text-uq",
      ].join(" ")}
    >
      {label}
      {warn && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-uq-danger flex-shrink-0"
          aria-label="empty"
          title="Empty"
        />
      )}
    </button>
  );
}

interface TimerInfo { mm: string; ss: string; warning: boolean; critical: boolean; expired: boolean; fraction: number; }

function useTimer(deadlineIso: string, totalMinutes: number): TimerInfo {
  const deadline = new Date(deadlineIso).getTime();
  const totalMs = Math.max(1, totalMinutes * 60_000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, deadline - now);
  const totalSec = Math.floor(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return {
    mm: String(m).padStart(2, "0"),
    ss: String(s).padStart(2, "0"),
    warning: remaining < 10 * 60_000,
    critical: remaining < 60_000,
    expired: remaining === 0,
    // Fraction of time REMAINING (1 → full, 0 → expired) for the ambient ring.
    fraction: Math.max(0, Math.min(1, remaining / totalMs)),
  };
}

/**
 * WYSIWYG memo editor. Stores content as HTML (TipTap's native format).
 * Remounts when the active task changes (via key={activeTask} on the parent
 * caller) so each task gets its own undo history and cursor state.
 */
function MemoEditor({
  initialContent,
  placeholder,
  onChange,
  onPasteCapture,
}: {
  initialContent: string;
  placeholder: string;
  onChange: (html: string) => void;
  onPasteCapture?: (charCount: number) => void;
}) {
  const onPasteCaptureRef = useRef(onPasteCapture);
  useEffect(() => { onPasteCaptureRef.current = onPasteCapture; }, [onPasteCapture]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content: initialContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "memo-editor flex-1 min-h-0 overflow-y-auto px-6 py-4",
      },
      handlePaste: (_view, event) => {
        const txt = event.clipboardData?.getData("text") ?? "";
        if (txt.length > 0) onPasteCaptureRef.current?.(txt.length);
        return false; // let Tiptap handle insertion as normal
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <MemoToolbar editor={editor} />
      <EditorContent editor={editor} className="flex-1 min-h-0 overflow-hidden flex flex-col" />
    </div>
  );
}

function MemoToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) {
    return (
      <div className="border-b border-uq-faint px-2 py-1.5 bg-uq-glass-subtle text-xs flex-shrink-0 h-9" />
    );
  }
  const isActive = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs);
  return (
    <div className="border-b border-uq-faint px-2 py-1.5 flex items-center gap-0.5 bg-uq-glass-subtle text-xs flex-shrink-0 flex-wrap">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={isActive("bold")}
        title="Bold (Ctrl+B)"
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={isActive("italic")}
        title="Italic (Ctrl+I)"
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={isActive("strike")}
        title="Strikethrough"
      >
        <span className="line-through">S</span>
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={isActive("heading", { level: 2 })}
        title="Heading"
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={isActive("heading", { level: 3 })}
        title="Sub-heading"
      >
        H3
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={isActive("bulletList")}
        title="Bullet list"
      >
        •&nbsp;List
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={isActive("orderedList")}
        title="Numbered list"
      >
        1.&nbsp;List
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={isActive("blockquote")}
        title="Quote"
      >
        &ldquo;&rdquo;
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal rule"
      >
        —
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        title="Undo (Ctrl+Z)"
      >
        ↶
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        title="Redo (Ctrl+Shift+Z)"
      >
        ↷
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => {
        // Preserve editor selection when clicking the toolbar
        e.preventDefault();
      }}
      onClick={onClick}
      title={title}
      type="button"
      className={`px-2 py-1 rounded-md transition-colors text-xs min-w-[26px] ${
        active
          ? "bg-uq-accent-soft text-uq border border-uq-accent"
          : "text-uq-2 hover:bg-uq-elev2 hover:text-uq"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-4 bg-uq-border mx-0.5" />;
}

/**
 * Ambient timer: a slim progress ring that depletes and shifts hue as time
 * runs out (calm indigo → amber under 10 min → red under 2), with the numeric
 * time shown smaller alongside. Visual only — drives off the existing timer.
 */
function TimerPill({ timer }: { timer: TimerInfo }) {
  const ring = timer.critical
    ? "var(--uq-danger)"
    : timer.warning
    ? "var(--uq-warn)"
    : "var(--uq-accent)";
  const textCls = timer.critical
    ? "text-[color:var(--uq-danger-text)]"
    : timer.warning
    ? "text-[color:var(--uq-warn-text)]"
    : "text-uq-2";
  const R = 9;
  const C = 2 * Math.PI * R;
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full bg-uq-elev1 border border-uq shadow-uq-e1 pl-1.5 pr-3 py-1"
      title={`${timer.mm}:${timer.ss} remaining`}
    >
      <span className="relative inline-flex items-center justify-center" style={{ width: 22, height: 22 }}>
        <svg width="22" height="22" viewBox="0 0 22 22" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="11" cy="11" r={R} fill="none" stroke="var(--uq-border)" strokeWidth="2.5" />
          <circle
            cx="11" cy="11" r={R} fill="none" stroke={ring} strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - timer.fraction)}
            style={{ transition: "stroke-dashoffset 1s linear, stroke 400ms ease" }}
          />
        </svg>
      </span>
      <span className={`text-sm font-mono tabular-nums font-medium ${textCls}`}>
        {timer.mm}:{timer.ss}
      </span>
    </div>
  );
}
