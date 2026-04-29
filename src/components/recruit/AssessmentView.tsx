"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import LiveEventsOverlay from "./LiveEventsOverlay";

interface TaskCfg {
  number: 1 | 2;
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
}

export interface AssessmentInitial {
  stage: string;
  assessment: { id: string; title: string; totalMinutes: number; closeDate: string };
  scenario: {
    title: string; organisation: string; positionTitle: string; taskCount: number;
    tasks: TaskCfg[];
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

export default function AssessmentView({
  token, initial, onReload,
}: {
  token: string;
  initial: AssessmentInitial;
  onReload: () => Promise<void> | void;
}) {
  const tasks = initial.scenario.tasks;
  const [activeTask, setActiveTask] = useState<1 | 2>(1);
  const activeTaskCfg = tasks.find((t) => t.number === activeTask) ?? tasks[0];

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

  /* ------ 2-panel resizable layout + overlay chat drawer ------ */
  // Layout is Exhibit | Memo. Chat lives in a right-edge rail + slide-in
  // drawer so the candidate can close it and reclaim full memo width.
  const [exhibitWidth, setExhibitWidth] = useState<number>(720);
  const [memoCollapsed, setMemoCollapsed] = useState(false);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [hasUnreadAI, setHasUnreadAI] = useState(false);
  const [isWide, setIsWide] = useState(true);
  const panelContainerRef = useRef<HTMLDivElement | null>(null);
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

  // Track viewport so we only apply pixel widths on lg+ (below lg the sections
  // stack via flex-col and should use full container width).
  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Hydrate + persist layout prefs (v2: dropped the chat column width since
  // chat is now a drawer, not a permanent layout panel).
  useEffect(() => {
    try {
      const raw = localStorage.getItem("fam-layout-v2");
      if (!raw) return;
      const p = JSON.parse(raw);
      if (typeof p.exhibitWidth === "number" && p.exhibitWidth >= 360) {
        setExhibitWidth(p.exhibitWidth);
      }
      if (typeof p.memoCollapsed === "boolean") setMemoCollapsed(p.memoCollapsed);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("fam-layout-v2", JSON.stringify({
        exhibitWidth,
        memoCollapsed,
      }));
    } catch { /* ignore */ }
  }, [exhibitWidth, memoCollapsed]);

  // Single divider between exhibit and memo. Memo auto-flexes to take the rest.
  const startExhibitDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    // Capture the pointer on the divider so pointermove keeps firing even when
    // the cursor crosses into the sandboxed exhibit iframe (otherwise the
    // iframe swallows the events and the drag freezes going left).
    e.currentTarget.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const start = exhibitWidth;
    const container = panelContainerRef.current;
    const containerW = container?.getBoundingClientRect().width ?? 1200;
    const MIN_EXHIBIT = 360;
    const MIN_MEMO = 320;
    const CHAT_RAIL_W = 48;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const reserveRight = (memoCollapsed ? 48 : MIN_MEMO) + CHAT_RAIL_W + 6;
      const maxExhibit = containerW - reserveRight;
      const next = Math.max(MIN_EXHIBIT, Math.min(maxExhibit, start + dx));
      setExhibitWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [exhibitWidth, memoCollapsed]);

  // Chat drawer: opening clears the unread indicator; we also try to focus
  // the textarea so candidates can start typing immediately.
  const toggleChatDrawer = useCallback((force?: boolean) => {
    setChatDrawerOpen((current) => {
      const next = force !== undefined ? force : !current;
      if (next) setHasUnreadAI(false);
      return next;
    });
  }, []);
  useEffect(() => {
    if (chatDrawerOpen) {
      const id = window.setTimeout(() => chatInputRef.current?.focus(), 140);
      return () => window.clearTimeout(id);
    }
  }, [chatDrawerOpen]);

  // Cmd/Ctrl+J toggles the drawer; Esc closes it. Mirrors the VSCode terminal
  // convention and gives the candidate a fast way back to writing.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "j") {
        ev.preventDefault();
        toggleChatDrawer();
        return;
      }
      if (ev.key === "Escape" && chatDrawerOpen) {
        toggleChatDrawer(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatDrawerOpen, toggleChatDrawer]);

  // Flash the rail when an AI reply arrives while the drawer is closed.
  const prevAiCountRef = useRef(initial.interactions.filter((i) => i.actor === "ai").length);
  useEffect(() => {
    const aiCount = interactions.filter((i) => i.actor === "ai").length;
    if (aiCount > prevAiCountRef.current && !chatDrawerOpen) {
      setHasUnreadAI(true);
    }
    prevAiCountRef.current = aiCount;
  }, [interactions, chatDrawerOpen]);

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
  const saveMemo = useCallback(async (taskNumber: 1 | 2, content: string) => {
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
  const timer = useTimer(initial.candidate.deadline);
  // Auto-submit on expiry
  useEffect(() => {
    if (timer.expired && !submittedRef.current) {
      void submit();
    }
  }, [timer.expired, submit]);

  const wordCounts = useMemo(() => ({
    1: wordCount(memos[1] || ""),
    2: wordCount(memos[2] || ""),
  }), [memos]);

  const trailForActive = interactions.filter((i) => i.taskNumber === activeTask);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logos/uniqassess-logo.png"
              alt="UNIQAssess"
              width={140}
              height={38}
              className="h-7 w-auto flex-shrink-0"
            />
            <span className="text-slate-300 hidden sm:inline">|</span>
            <div className="text-sm min-w-0">
              <div className="font-semibold text-[#1B2A4A] truncate">
                {initial.scenario.positionTitle}
              </div>
              <div className="text-xs text-slate-500 truncate">
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
              className="px-4 py-1.5 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338] disabled:bg-slate-300"
            >
              {submitting ? "Submitting…" : "Submit assessment"}
            </button>
          </div>
        </div>
      </header>

      {/* Layout body.
          - Main content: Exhibit | drag-handle | Memo, with a 48px chat rail
            reserved on the right.
          - Chat is a slide-in overlay drawer launched from the rail (or
            Ctrl/Cmd+J). It sits above the memo while open; the exhibit stays
            fully visible and interactive to the candidate's left.
          - Widths + memo-collapse state persist in localStorage. */}
      <div
        ref={panelContainerRef}
        className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden relative pr-12"
      >
          {/* Exhibit */}
          <section
            style={isWide ? { width: exhibitWidth, flexShrink: 0 } : undefined}
            className="bg-white flex flex-col min-h-0 overflow-hidden flex-1 lg:flex-none border-b lg:border-b-0 lg:border-r border-slate-200"
          >
            <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex-shrink-0 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-[#4B92DB] font-semibold">Exhibit · Task {activeTask}</div>
                <div className="text-sm font-semibold text-[#1B2A4A] truncate">{activeTaskCfg.exhibitTitle}</div>
              </div>
              <button
                onClick={() => setExhibitFullscreen(true)}
                className="text-xs px-2.5 py-1 rounded border border-slate-300 hover:bg-white flex-shrink-0"
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

          {/* Single divider between exhibit and memo */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize exhibit and memo panels"
            onPointerDown={startExhibitDrag}
            className="hidden lg:block w-1.5 bg-slate-200 hover:bg-[#4B92DB] active:bg-[#4B92DB] cursor-col-resize flex-shrink-0 transition-colors"
            title="Drag to resize"
          />

          {/* Memo (expanded) or memo rail (collapsed, lg+ only) */}
          {memoCollapsed && isWide ? (
            <button
              type="button"
              onClick={() => setMemoCollapsed(false)}
              className="hidden lg:flex flex-col items-center justify-between w-12 bg-[#1B2A4A] hover:bg-[#142338] text-white py-3 flex-shrink-0 transition-colors border-l border-slate-300 group"
              aria-label={`Expand memo editor (currently ${wordCounts[activeTask]} words)`}
              title={`Expand memo — ${wordCounts[activeTask]} words in Task ${activeTask}`}
            >
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-lg leading-none group-hover:-translate-x-0.5 transition-transform" aria-hidden>◀</span>
                <span className="text-[9px] uppercase tracking-wider opacity-80 font-semibold">Expand</span>
              </div>
              <div className="flex-1 flex items-center justify-center px-1">
                <span
                  className="text-xs font-semibold tracking-wider whitespace-nowrap"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                  MEMO · TASK {activeTask}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[11px] tabular-nums font-semibold">
                  {wordCounts[activeTask]}w
                </span>
                {wordCounts[activeTask] === 0 && (
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" aria-hidden />
                )}
              </div>
            </button>
          ) : (
            <section className="bg-white flex flex-col min-h-0 overflow-hidden flex-1 lg:min-w-0">
              {/* Memo header with collapse affordance */}
              <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex-shrink-0 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-[#4B92DB] font-semibold">
                    Your deliverable · Task {activeTask}
                  </div>
                  <div className="text-sm font-semibold text-[#1B2A4A] truncate">
                    {activeTaskCfg.deliverableLabel}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMemoCollapsed(true)}
                  className="hidden lg:flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-300 hover:bg-white flex-shrink-0 text-slate-600"
                  title="Collapse the memo to give the exhibit more room"
                  aria-label="Collapse memo"
                >
                  <span aria-hidden>▶</span>
                  <span>Collapse</span>
                </button>
              </div>

              {/* Brief — relocated above the editor so candidates can reference
                  the task framing without opening the AI drawer. */}
              <div className="border-b border-slate-200 bg-slate-50/60 flex-shrink-0">
                <button
                  onClick={() => setBriefOpen((v) => !v)}
                  className="w-full text-left px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 flex items-center justify-between"
                >
                  <span>Brief — Task {activeTask}: {activeTaskCfg.title}</span>
                  <span className="text-slate-400">{briefOpen ? "−" : "+"}</span>
                </button>
                {briefOpen && (
                  <div className="px-4 pb-3 text-sm text-slate-700 leading-relaxed max-h-56 overflow-y-auto">
                    <MarkdownView>{activeTaskCfg.briefMarkdown}</MarkdownView>
                  </div>
                )}
              </div>

              <MemoEditor
                key={activeTask}
                initialContent={memos[activeTask] || ""}
                placeholder={activeTaskCfg.deliverablePlaceholder}
                onChange={(html) => setMemos((prev) => ({ ...prev, [activeTask]: html }))}
                onPasteCapture={(charCount) => logActivity("paste", { target: "memo", charCount })}
              />

              <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center justify-between flex-shrink-0">
                <span>{wordCounts[activeTask]} words</span>
                <span>
                  {memoSaving[activeTask]
                    ? "Saving…"
                    : savedAt[activeTask]
                    ? `Saved ${new Date(savedAt[activeTask]!).toLocaleTimeString()}`
                    : "Not yet saved"}
                </span>
              </div>
            </section>
          )}

        {/* Chat rail — always fixed to the right edge. Opens the drawer. */}
        <button
          type="button"
          onClick={() => toggleChatDrawer(true)}
          className={`absolute right-0 top-0 bottom-0 w-12 flex flex-col items-center justify-between py-3 text-white transition-colors border-l border-slate-300 z-30 ${
            chatDrawerOpen ? "bg-[#142338]" : "bg-[#1B2A4A] hover:bg-[#142338]"
          }`}
          aria-label="Open IDSC investigation chat (Ctrl/Cmd+J)"
          aria-expanded={chatDrawerOpen}
          title="Investigation chat — Ctrl/Cmd+J"
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
            <span className="text-[9px] uppercase tracking-wider opacity-80 font-semibold">Ask</span>
          </div>
          <div className="flex-1 flex items-center justify-center px-1">
            <span
              className="text-xs font-semibold tracking-wider whitespace-nowrap"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              INVESTIGATION
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums opacity-80 font-semibold">
              {trailForActive.length}
            </span>
            {hasUnreadAI && !chatDrawerOpen && (
              <span
                className="w-2 h-2 rounded-full bg-[#4B92DB] animate-pulse"
                aria-label="New AI reply"
                title="New reply"
              />
            )}
          </div>
        </button>

        {/* Dimmed backdrop over the memo area while the drawer is open. The
            exhibit stays un-dimmed and fully interactive so candidates can
            still read/scroll source data while querying the AI. */}
        {chatDrawerOpen && (
          <div
            className="absolute top-0 bottom-0 bg-slate-900/15 z-40"
            style={{ left: isWide ? exhibitWidth + 6 : 0, right: 48 }}
            onClick={() => toggleChatDrawer(false)}
            aria-hidden
          />
        )}

        {/* Chat drawer — slides in from the right. Fixed 460px on lg+, takes
            the remaining width (screen minus rail) on smaller screens. */}
        <aside
          className="absolute top-0 bottom-0 bg-white border-l border-slate-300 shadow-2xl z-50 flex flex-col"
          style={{
            right: 48,
            width: isWide ? 460 : "calc(100% - 48px)",
            transform: chatDrawerOpen ? "translateX(0)" : "translateX(calc(100% + 48px))",
            transition: "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          aria-hidden={!chatDrawerOpen}
          aria-label="IDSC investigation chat"
        >
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex-shrink-0 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-[#4B92DB] font-semibold">
                Investigation · Task {activeTask}
              </div>
              <div className="text-sm font-semibold text-[#1B2A4A] truncate">
                IDSC Knowledge System
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggleChatDrawer(false)}
              className="text-slate-500 hover:text-slate-900 w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center flex-shrink-0 text-2xl leading-none"
              aria-label="Close chat (Esc)"
              title="Close (Esc)"
            >
              ×
            </button>
          </div>

          <div ref={chatScroller} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {trailForActive.length === 0 && (
              <div className="text-xs text-slate-500 italic">
                Ask the system anything. Be specific — request source documents, underlying data,
                or detail on a particular item.
              </div>
            )}
            {trailForActive.map((i) => <ChatBubble key={i.id} entry={i} />)}
            {sending && <div className="text-xs text-slate-500 italic">IDSC system is replying…</div>}
          </div>

          {chatError && (
            <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-red-800 text-xs">{chatError}</div>
          )}

          <div className="border-t border-slate-200 p-3 flex-shrink-0">
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
              placeholder="Ask the IDSC Knowledge System… (Ctrl/Cmd ⏎ to send)"
              className="w-full h-20 text-sm border border-slate-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-[#4B92DB] focus:border-[#4B92DB] resize-none"
              maxLength={CHAT_MAX_CHARS}
              disabled={sending}
            />
            {(() => {
              const len = (chatInputs[activeTask] || "").length;
              const nearLimit = len >= CHAT_MAX_CHARS * 0.9;
              const atLimit = len >= CHAT_MAX_CHARS;
              const counterClass = atLimit
                ? "text-red-600 font-semibold tabular-nums"
                : nearLimit
                ? "text-amber-600 font-semibold tabular-nums"
                : "text-slate-500 tabular-nums";
              return (
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className={counterClass}>
                    {len.toLocaleString()} / {CHAT_MAX_CHARS.toLocaleString()}
                    {atLimit && <span className="ml-1.5 font-normal">character limit reached</span>}
                  </span>
                  <button
                    onClick={() => void sendMessage()}
                    disabled={!(chatInputs[activeTask] || "").trim() || sending}
                    className="px-3 py-1.5 rounded-md bg-[#4B92DB] text-white text-xs font-semibold hover:bg-[#357fc8] disabled:bg-slate-300"
                  >
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
              );
            })()}
          </div>
        </aside>
      </div>

      {/* Fullscreen exhibit modal */}
      {exhibitFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 flex flex-col p-3"
          onClick={() => setExhibitFullscreen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl flex flex-col h-full w-full max-w-6xl mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#4B92DB] font-semibold">
                  Exhibit · Task {activeTask}
                </div>
                <div className="text-base font-semibold text-[#1B2A4A]">{activeTaskCfg.exhibitTitle}</div>
              </div>
              <button
                onClick={() => setExhibitFullscreen(false)}
                className="text-slate-500 hover:text-slate-900 text-2xl w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <iframe
              srcDoc={activeTaskCfg.exhibitHtml}
              sandbox=""
              className="flex-1 w-full border-0 rounded-b-lg bg-white"
              title={activeTaskCfg.exhibitTitle}
            />
          </div>
        </div>
      )}

      {/* Submit modal */}
      {confirmOpen && (() => {
        const interactionCounts = {
          1: interactions.filter((i) => i.taskNumber === 1 && i.actor === "candidate").length,
          2: interactions.filter((i) => i.taskNumber === 2 && i.actor === "candidate").length,
        };
        const flags: { task: 1 | 2; kind: "empty-memo" | "short-memo" | "no-ai"; label: string }[] = [];
        ([1, 2] as const).forEach((t) => {
          if (wordCounts[t] === 0) {
            flags.push({ task: t, kind: "empty-memo", label: `Task ${t} memo is empty` });
          } else if (wordCounts[t] < 50) {
            flags.push({ task: t, kind: "short-memo", label: `Task ${t} memo is very short (${wordCounts[t]} words)` });
          }
          if (interactionCounts[t] === 0) {
            flags.push({ task: t, kind: "no-ai", label: `You have not used the AI system on Task ${t}` });
          }
        });
        const hasCritical = flags.some((f) => f.kind === "empty-memo" || f.kind === "no-ai");
        return (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setConfirmOpen(false)}
          >
            <div className="bg-white rounded-lg max-w-lg w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-[#1B2A4A]">Submit assessment?</h3>
              <p className="text-sm text-slate-600 mt-2">
                This assessment has <strong>two tasks</strong>. You will not be able to return
                to this assessment or modify your responses after submission.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {([1, 2] as const).map((t) => (
                  <div
                    key={t}
                    className={`border rounded-md p-3 ${
                      wordCounts[t] === 0 || interactionCounts[t] === 0
                        ? "bg-red-50 border-red-200"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="text-xs text-slate-500">Task {t}</div>
                    <div className="font-semibold">
                      {wordCounts[t]} words
                      <span className="text-xs font-normal text-slate-500 ml-1">memo</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      {interactionCounts[t]} AI {interactionCounts[t] === 1 ? "question" : "questions"}
                    </div>
                  </div>
                ))}
              </div>
              {flags.length > 0 && (
                <div
                  className={`mt-3 text-xs rounded-md p-3 border ${
                    hasCritical
                      ? "text-red-800 bg-red-50 border-red-200"
                      : "text-amber-800 bg-amber-50 border-amber-200"
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
                          className="w-full text-left flex items-start gap-2 px-2 py-1 rounded hover:bg-white/60 transition group"
                        >
                          <span className="opacity-60 mt-0.5 leading-tight">•</span>
                          <span className="flex-1">{f.label}</span>
                          <span className="font-semibold underline opacity-80 group-hover:opacity-100 whitespace-nowrap">
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
                  className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void submit()}
                  disabled={submitting}
                  className={`px-4 py-2 rounded-md text-white text-sm font-semibold disabled:bg-slate-300 ${
                    hasCritical
                      ? "bg-red-700 hover:bg-red-800"
                      : "bg-[#1B2A4A] hover:bg-[#142338]"
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
        className={`max-w-[90%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-[#1B2A4A] text-white whitespace-pre-wrap"
            : "bg-slate-100 text-slate-900 border border-slate-200"
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
          h4: (p) => <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-2 mb-1">{p.children}</h4>,
          p: (p) => <p className="mb-2 last:mb-0 leading-relaxed">{p.children}</p>,
          ul: (p) => <ul className="list-disc pl-5 mb-2 space-y-0.5 last:mb-0">{p.children}</ul>,
          ol: (p) => <ol className="list-decimal pl-5 mb-2 space-y-0.5 last:mb-0">{p.children}</ol>,
          li: (p) => <li className="leading-relaxed">{p.children}</li>,
          strong: (p) => <strong className="font-semibold">{p.children}</strong>,
          em: (p) => <em className="italic">{p.children}</em>,
          hr: () => <hr className="my-3 border-slate-200" />,
          blockquote: (p) => (
            <blockquote className="border-l-4 border-slate-300 pl-3 italic my-2 text-slate-600">
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
              <code className="bg-slate-200/70 px-1 py-0.5 rounded text-[0.85em] font-mono" {...rest}>
                {children}
              </code>
            );
          },
          pre: (p) => (
            <pre className="bg-slate-900 text-slate-100 text-xs rounded p-2.5 overflow-x-auto my-2 font-mono">
              {p.children}
            </pre>
          ),
          table: (p) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border-collapse text-xs">{p.children}</table>
            </div>
          ),
          thead: (p) => <thead className="bg-slate-100">{p.children}</thead>,
          th: (p) => (
            <th className="border border-slate-300 px-2 py-1 text-left font-semibold">
              {p.children}
            </th>
          ),
          td: (p) => <td className="border border-slate-300 px-2 py-1 align-top">{p.children}</td>,
          a: (p) => (
            <a className="text-[#4B92DB] underline hover:no-underline" target="_blank" rel="noreferrer" {...(p as any)}>
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
  active: 1 | 2;
  onSwitch: (n: 1 | 2) => void;
  wordCounts: Record<number, number>;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="hidden xl:inline text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
        {tasks.length} tasks
      </span>
      <div className="inline-flex border border-slate-300 rounded-md overflow-hidden shadow-sm">
        {tasks.map((t) => {
          const isActive = active === t.number;
          const shortTitle = t.title.split("&")[0].trim();
          const empty = (wordCounts[t.number] ?? 0) === 0;
          return (
            <button
              key={t.number}
              onClick={() => onSwitch(t.number)}
              className={[
                "px-3 py-1.5 text-xs border-r border-slate-300 last:border-r-0 transition flex items-center gap-1.5",
                isActive
                  ? "bg-[#1B2A4A] text-white"
                  : "bg-white text-[#1B2A4A] hover:bg-slate-50",
              ].join(" ")}
              title={`Task ${t.number} of ${tasks.length}: ${t.title}`}
            >
              <span className="font-semibold">
                Task {t.number}
                <span className="opacity-60">/{tasks.length}</span>
              </span>
              <span className="hidden md:inline opacity-60">·</span>
              <span className="hidden md:inline opacity-80 truncate max-w-[140px] font-medium">
                {shortTitle}
              </span>
              <span className="text-[10px] opacity-70 tabular-nums">{wordCounts[t.number]}w</span>
              {!isActive && empty && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0"
                  title="No memo content yet"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface TimerInfo { mm: string; ss: string; warning: boolean; critical: boolean; expired: boolean; }

function useTimer(deadlineIso: string): TimerInfo {
  const deadline = new Date(deadlineIso).getTime();
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
      <div className="border-b border-slate-200 px-2 py-1.5 bg-slate-50/80 text-xs flex-shrink-0 h-9" />
    );
  }
  const isActive = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs);
  return (
    <div className="border-b border-slate-200 px-2 py-1.5 flex items-center gap-0.5 bg-slate-50/80 text-xs flex-shrink-0 flex-wrap">
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
      className={`px-2 py-1 rounded transition text-xs min-w-[26px] ${
        active
          ? "bg-[#1B2A4A] text-white"
          : "text-slate-700 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-4 bg-slate-300 mx-0.5" />;
}

function TimerPill({ timer }: { timer: TimerInfo }) {
  const cls = timer.critical
    ? "bg-red-50 text-red-700 border-red-200"
    : timer.warning
    ? "bg-amber-50 text-amber-800 border-amber-200"
    : "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-mono border ${cls}`}>
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {timer.mm}:{timer.ss}
    </div>
  );
}
