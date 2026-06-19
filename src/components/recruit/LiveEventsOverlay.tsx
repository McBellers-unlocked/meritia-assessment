"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Scripted-events overlay for the recruitment candidate view.
 *
 * Polls GET /api/assess/events/[token] on a ~7s cadence while the assessment
 * is running, and renders two overlay UIs on top of the main AssessmentView:
 *
 *   - a right-edge notification rail with inbox + chat badges
 *   - an inbox drawer that slides in from the right when opened
 *   - a Teams-style chat popup (bottom-right) when a persona script fires
 *
 * Both features are inert for scenarios that have no email_inbox or chat
 * tasks (the API returns empty arrays and nothing renders). This lets us
 * ship the overlay alongside the existing FAM scenario without touching
 * its memo-only UI.
 */

const POLL_INTERVAL_MS = 7_000;

interface DeliveredEmail {
  id: string;
  taskNumber: number;
  senderName: string;
  senderEmail: string;
  subject: string;
  bodyHtml: string;
  triggerOffsetSeconds: number;
  deliveredAt: string;
  response: {
    action: string;
    replyBody: string | null;
    respondedAt: string;
  } | null;
}

interface ActiveChat {
  scriptId: string;
  taskNumber: number;
  personaName: string;
  personaRole: string;
  openerMessage: string;
  openedAt: string;
  maxTurns: number;
}

interface EventsPayload {
  serverElapsedSeconds: number;
  emails: DeliveredEmail[];
  chat: ActiveChat | null;
}

interface ChatMessage {
  id: string;
  actor: "candidate" | "ai";
  content: string;
  timestamp: string;
}

export default function LiveEventsOverlay({
  token,
  active,
}: {
  token: string;
  /** If false (pre-start, submitted, expired) overlay stays dormant. */
  active: boolean;
}) {
  const [payload, setPayload] = useState<EventsPayload | null>(null);
  const [panel, setPanel] = useState<"none" | "inbox" | "chat">("none");
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [chatMinimised, setChatMinimised] = useState(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/assess/events/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (!res.ok) return; // quiet fail — candidate doesn't need an error for a background poll
      const body = (await res.json()) as EventsPayload;
      setPayload(body);
    } catch {
      // swallow — transient network, next poll will retry
    }
  }, [token]);

  useEffect(() => {
    if (!active) return;
    void poll();
    const id = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, poll]);

  // Badge counts: emails without a verdict yet; whether chat is active.
  const unreadEmails = useMemo(
    () => (payload?.emails ?? []).filter((e) => e.response === null).length,
    [payload]
  );
  const hasChatTask = !!payload?.chat;

  // Auto-popup the chat the first time it arrives (unless previously minimised).
  const chatArrivedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!payload?.chat) {
      chatArrivedRef.current = null;
      return;
    }
    if (chatArrivedRef.current !== payload.chat.scriptId) {
      chatArrivedRef.current = payload.chat.scriptId;
      setPanel("chat");
      setChatMinimised(false);
    }
  }, [payload?.chat?.scriptId, payload?.chat]);

  if (!active) return null;
  if (!payload) return null; // nothing loaded yet — avoid flashing empty rail

  const hasAnyOverlay = (payload.emails.length > 0) || hasChatTask;
  if (!hasAnyOverlay) return null; // legacy memo-only scenarios render nothing

  return (
    <>
      <NotificationRail
        unreadEmails={unreadEmails}
        hasChat={hasChatTask}
        chatActive={panel === "chat" && !chatMinimised}
        onOpenInbox={() => { setPanel(panel === "inbox" ? "none" : "inbox"); }}
        onOpenChat={() => { setPanel("chat"); setChatMinimised(false); }}
        emailsVisible={payload.emails.length > 0}
      />

      {panel === "inbox" && (
        <InboxDrawer
          token={token}
          emails={payload.emails}
          selectedEmailId={selectedEmailId}
          onSelect={setSelectedEmailId}
          onClose={() => setPanel("none")}
          onResponded={() => void poll()}
        />
      )}

      {payload.chat && !chatMinimised && panel === "chat" && (
        <ChatPopup
          token={token}
          chat={payload.chat}
          onMinimise={() => setChatMinimised(true)}
        />
      )}
      {payload.chat && chatMinimised && (
        <MinimisedChatPill
          personaName={payload.chat.personaName}
          onOpen={() => { setPanel("chat"); setChatMinimised(false); }}
        />
      )}
    </>
  );
}

// -------------------------------------------------------------------------
// Notification rail — right-edge vertical strip with badges.
// -------------------------------------------------------------------------

function NotificationRail({
  unreadEmails,
  hasChat,
  chatActive,
  onOpenInbox,
  onOpenChat,
  emailsVisible,
}: {
  unreadEmails: number;
  hasChat: boolean;
  chatActive: boolean;
  onOpenInbox: () => void;
  onOpenChat: () => void;
  emailsVisible: boolean;
}) {
  // Positioned to the left of the candidate's IDSC sidebar collapsed rail,
  // which lives at right-0 and occupies 48px (w-12). We offset to right-16
  // (64px) so this rail clears that sidebar rail entirely and never overlaps
  // its toggle/badges, while staying above it (z-30).
  return (
    <div className="fixed top-1/2 -translate-y-1/2 right-16 z-30 flex flex-col gap-2">
      {emailsVisible && (
        <button
          onClick={onOpenInbox}
          className="relative w-11 h-11 rounded-full bg-uq-glass backdrop-blur-xl border border-uq shadow-uq-glass hover:border-uq-accent hover:bg-uq-accent-soft text-uq-2 hover:text-uq transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
          title="Inbox"
          aria-label={`Inbox${unreadEmails ? `, ${unreadEmails} unread` : ""}`}
        >
          <EmailIcon />
          {unreadEmails > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-uq-accent text-[color:var(--uq-text-on-accent)] font-mono text-[10px] font-semibold flex items-center justify-center">
              {unreadEmails}
            </span>
          )}
        </button>
      )}
      {hasChat && (
        <button
          onClick={onOpenChat}
          className={`relative w-11 h-11 rounded-full border shadow-uq-glass backdrop-blur-xl transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] ${
            chatActive ? "bg-uq-persona-soft border-uq-persona text-uq-persona" : "bg-uq-glass border-uq text-uq-2 hover:border-uq-strong hover:bg-uq-elev2 hover:text-uq"
          }`}
          title="Chat"
          aria-label="Open chat"
        >
          <ChatIcon />
          {!chatActive && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-uq-persona animate-uq-pulse-glow" />
          )}
        </button>
      )}
    </div>
  );
}

function EmailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// -------------------------------------------------------------------------
// Inbox drawer — two-pane Outlook/Gmail-style mail window.
// -------------------------------------------------------------------------

/** Initials for a sender-avatar circle, e.g. "Jane Doe" -> "JD". */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Strip HTML tags from scenario-authored body to derive a one-line snippet.
 * Pure/cosmetic — never mutates the stored bodyHtml; the reading pane still
 * renders the original markup verbatim.
 */
function snippetOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Short received-time for list rows, e.g. "14:32" or "Jun 18". */
function shortTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Map a stored response action to a list-pane state chip + semantic tokens. */
function responseChip(action: string): { label: string; cls: string } {
  if (action === "replied") {
    return {
      label: "✓ Replied",
      cls: "bg-[color:var(--uq-success-soft)] border-[color:var(--uq-success-line)] text-[color:var(--uq-success-text)]",
    };
  }
  if (action === "flagged") {
    return {
      label: "⚑ Flagged",
      cls: "bg-[color:var(--uq-warn-soft)] border-[color:var(--uq-warn-line)] text-[color:var(--uq-warn-text)]",
    };
  }
  // ignored / anything else
  return {
    label: "⊘ Ignored",
    cls: "bg-uq-elev2 border-uq text-uq-3",
  };
}

function MailGlyph() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function InboxDrawer({
  token,
  emails,
  selectedEmailId,
  onSelect,
  onClose,
  onResponded,
}: {
  token: string;
  emails: DeliveredEmail[];
  selectedEmailId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  onResponded: () => void;
}) {
  const selected = emails.find((e) => e.id === selectedEmailId) ?? emails[0] ?? null;
  const unreadCount = emails.filter((e) => e.response === null).length;

  return (
    <div className="fixed inset-y-0 right-0 w-[880px] max-w-full bg-uq-glass-strong backdrop-blur-xl shadow-uq-pop border-l border-uq z-40 flex flex-col">
      {/* Mail title bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-uq-faint bg-uq-glass-strong">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-uq-accent-soft border border-uq-accent text-uq-accent flex items-center justify-center flex-shrink-0">
            <MailGlyph />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-uq">Mail</span>
              {unreadCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-uq-accent text-[color:var(--uq-text-on-accent)] font-mono text-[10px] font-semibold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="font-mono text-[11px] text-uq-3 truncate">Inbox — Candidate mailbox</div>
          </div>
        </div>
        <button onClick={onClose} className="text-sm text-uq-3 hover:text-uq transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] rounded px-1" aria-label="Close inbox">✕</button>
      </div>

      {/* Two-pane body: list (left) + reading pane (right) */}
      <div className="flex flex-1 min-h-0">
        <ul className="w-[300px] flex-shrink-0 border-r border-uq-faint overflow-y-auto bg-uq-glass-subtle">
          {emails.map((e) => {
            const isSelected = selected?.id === e.id;
            const unread = e.response === null;
            const chip = e.response ? responseChip(e.response.action) : null;
            return (
              <li key={e.id}>
                <button
                  onClick={() => onSelect(e.id)}
                  className={`w-full text-left px-3 py-3 border-b border-uq-faint transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] ${
                    isSelected
                      ? "bg-uq-accent-soft border-l-2 border-l-uq-accent"
                      : "border-l-2 border-l-transparent hover:bg-uq-elev2"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-uq-elev3 border border-uq text-uq-2 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {initialsOf(e.senderName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className={`truncate text-sm flex items-center gap-1.5 ${unread ? "font-semibold text-uq" : "text-uq-2"}`}>
                          {unread && <span className="w-1.5 h-1.5 rounded-full bg-uq-accent flex-shrink-0" />}
                          <span className="truncate">{e.senderName}</span>
                        </div>
                        <span className="font-mono text-[10px] text-uq-3 flex-shrink-0">{shortTime(e.deliveredAt)}</span>
                      </div>
                      <div className={`truncate text-xs mt-0.5 ${unread ? "font-medium text-uq" : "text-uq-2"}`}>{e.subject}</div>
                      <div className="truncate text-[11px] text-uq-3 mt-0.5">{snippetOf(e.bodyHtml)}</div>
                      {chip && (
                        <span className={`inline-block mt-1.5 px-1.5 py-0.5 rounded-full border font-mono text-[9px] ${chip.cls}`}>
                          {chip.label}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex-1 min-w-0 overflow-y-auto">
          {selected ? (
            <EmailReader
              key={selected.id}
              token={token}
              email={selected}
              onResponded={onResponded}
            />
          ) : (
            <div className="p-6 text-sm text-uq-3">Select a message to read.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmailReader({
  token,
  email,
  onResponded,
}: {
  token: string;
  email: DeliveredEmail;
  onResponded: () => void;
}) {
  const [replyBody, setReplyBody] = useState(email.response?.replyBody ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Local UI state only: whether the inline compose card is open and which
  // command opened it (cosmetic prefill only — submit logic is unchanged).
  const [composeMode, setComposeMode] = useState<"reply" | "reply-all" | "forward" | null>(null);

  useEffect(() => {
    setReplyBody(email.response?.replyBody ?? "");
    setError(null);
    // If this email was already replied to, open the compose card on the
    // existing draft so the reply stays directly editable (as it was before
    // the command-bar redesign); otherwise keep the reader uncluttered.
    setComposeMode(email.response?.action === "replied" ? "reply" : null);
  }, [email.id, email.response]);

  const submit = async (action: "replied" | "ignored" | "flagged") => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/assess/emails/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          emailId: email.id,
          action,
          replyBody: action === "replied" ? replyBody : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      onResponded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const alreadyResponded = !!email.response;

  // Cosmetic To/Subject prefill per compose mode — no API or schema change.
  const composeTo =
    composeMode === "forward"
      ? ""
      : composeMode === "reply-all"
      ? `${email.senderName} <${email.senderEmail}>, others`
      : `${email.senderName} <${email.senderEmail}>`;
  const composeSubject =
    composeMode === "forward" ? `Fwd: ${email.subject}` : `Re: ${email.subject}`;

  const ghostBtn =
    "px-2.5 py-1.5 rounded-lg border border-uq-strong bg-uq-glass-subtle text-uq-2 text-xs font-medium transition-colors hover:border-uq-accent hover:bg-uq-accent-soft hover:text-uq disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]";

  return (
    <div className="flex flex-col min-h-full">
      {/* Command bar */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-uq-faint bg-uq-glass-subtle sticky top-0 z-10">
        <button onClick={() => setComposeMode("reply")} disabled={submitting} className={ghostBtn}>Reply</button>
        <button onClick={() => setComposeMode("reply-all")} disabled={submitting} className={ghostBtn}>Reply all</button>
        <button onClick={() => setComposeMode("forward")} disabled={submitting} className={ghostBtn}>Forward</button>
        <span className="mx-1 h-5 w-px bg-uq-faint" aria-hidden="true" />
        <button onClick={() => submit("flagged")} disabled={submitting} className={ghostBtn}>Flag</button>
        <button onClick={() => submit("ignored")} disabled={submitting} className={ghostBtn}>Ignore</button>
      </div>

      <div className="p-5 space-y-4">
        {/* Reading-pane header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-uq-elev3 border border-uq text-uq flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {initialsOf(email.senderName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold tracking-[-0.005em] text-uq">{email.subject}</div>
            <div className="text-sm text-uq-2 mt-1">
              From <span className="font-medium text-uq">{email.senderName}</span> &lt;{email.senderEmail}&gt;
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <span className="text-xs text-uq-3">To: <span className="text-uq-2">You</span></span>
              <span className="font-mono text-xs text-uq-3">{new Date(email.deliveredAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Body — light reading card (scenario-authored HTML, stays light) */}
        <div
          className="prose prose-sm max-w-none rounded-lg p-5 border border-uq bg-white text-slate-900"
          dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
        />

        {alreadyResponded && (
          <div className="text-xs bg-[color:var(--uq-success-soft)] border border-[color:var(--uq-success-line)] text-[color:var(--uq-success-text)] rounded-md px-3 py-2">
            You {email.response!.action === "replied" ? "replied" : email.response!.action === "ignored" ? "chose not to respond" : "flagged this"} at {new Date(email.response!.respondedAt).toLocaleTimeString()}.
            {email.response!.action === "replied" && " Reply with the command bar above to edit your reply."}
          </div>
        )}

        {error && <div className="bg-[color:var(--uq-danger-soft)] border border-[color:var(--uq-danger-line)] text-[color:var(--uq-danger-text)] text-sm rounded-md px-3 py-2">{error}</div>}

        {/* Inline compose card — revealed by Reply / Reply all / Forward */}
        {composeMode && (
          <div className="rounded-lg border border-uq-strong bg-uq-elev1 shadow-uq-glass overflow-hidden">
            <div className="px-3 py-2 border-b border-uq-faint bg-uq-glass-subtle">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-uq-3 w-14 flex-shrink-0">To</span>
                <span className="text-uq-2 truncate">{composeTo || "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-xs mt-1">
                <span className="text-uq-3 w-14 flex-shrink-0">Subject</span>
                <span className="text-uq-2 truncate">{composeSubject}</span>
              </div>
            </div>
            <div className="p-3">
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Type your reply here, or use Ignore / Flag if you don't want to respond."
                maxLength={10_000}
                className="w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 h-40 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
              />
              <div className="font-mono text-[10px] text-uq-3 mt-1 text-right tabular-nums">{replyBody.length} / 10,000</div>
              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  onClick={() => setComposeMode(null)}
                  disabled={submitting}
                  className="px-3 py-1.5 rounded-lg border border-uq-strong bg-uq-glass-subtle text-uq-2 text-sm font-medium transition-colors hover:border-uq-accent hover:bg-uq-accent-soft hover:text-uq disabled:opacity-50 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => submit("replied")}
                  disabled={submitting || !replyBody.trim()}
                  className="px-4 py-1.5 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
                >
                  {submitting ? "Sending…" : alreadyResponded && email.response?.action === "replied" ? "Update reply" : "Send reply"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Teams-style chat popup.
// -------------------------------------------------------------------------

function ChatPopup({
  token,
  chat,
  onMinimise,
}: {
  token: string;
  chat: ActiveChat;
  onMinimise: () => void;
}) {
  // Local state for the persona conversation. We persist via /api/assess/chat
  // with threadKey set so the persona Claude's history doesn't collide with
  // memo tasks' investigation chats.
  const threadKey = useMemo(() => `chat-${chat.scriptId}`, [chat.scriptId]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "opener", actor: "ai", content: chat.openerMessage, timestamp: chat.openedAt },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load any prior conversation on mount (candidate may have minimised and
  // returned). We query /api/assess/state because it already carries the
  // interactions trail; filtering client-side by threadKey is simplest.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/assess/state/${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        const trail = (body.interactions as Array<{ id: string; actor: string; content: string; timestamp: string; taskNumber: number }>) ?? [];
        // We don't have threadKey in the state payload (legacy shape), so we
        // filter by taskNumber AND assume only persona-chat entries on a
        // chat task. Good enough for MVP — if this proves brittle we'll
        // expose threadKey in the state payload.
        const chatTrail = trail
          .filter((t) => t.taskNumber === chat.taskNumber)
          .map((t) => ({
            id: t.id,
            actor: t.actor === "candidate" ? "candidate" as const : "ai" as const,
            content: t.content,
            timestamp: t.timestamp,
          }));
        if (chatTrail.length > 0) {
          setMessages([
            { id: "opener", actor: "ai", content: chat.openerMessage, timestamp: chat.openedAt },
            ...chatTrail,
          ]);
        }
      } catch {
        // non-fatal
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.scriptId]);

  // Keep the latest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // How many candidate turns have we already sent (for maxTurns enforcement).
  const candidateTurns = messages.filter((m) => m.actor === "candidate").length;
  const reachedCap = candidateTurns >= chat.maxTurns;

  const send = async () => {
    const text = input.trim();
    if (!text || sending || reachedCap) return;
    setSending(true);
    setError(null);
    // Optimistic candidate bubble.
    const temp: ChatMessage = {
      id: `temp-${Date.now()}`,
      actor: "candidate",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((m) => [...m, temp]);
    setInput("");
    try {
      const res = await fetch("/api/assess/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          taskNumber: chat.taskNumber,
          message: text,
          threadKey,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      // Replace optimistic list with authoritative trail from server. We
      // re-inject the opener (server doesn't store it — it's config-level).
      const trail = (body.trail as Array<{ id: string; actor: string; content: string; timestamp: string }>)
        .map((t) => ({
          id: t.id,
          actor: t.actor === "candidate" ? "candidate" as const : "ai" as const,
          content: t.content,
          timestamp: t.timestamp,
        }));
      setMessages([
        { id: "opener", actor: "ai", content: chat.openerMessage, timestamp: chat.openedAt },
        ...trail,
      ]);
    } catch (e) {
      setError((e as Error).message);
      // Remove the optimistic message so the candidate can retry.
      setMessages((m) => m.filter((x) => x.id !== temp.id));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-full bg-uq-glass-strong backdrop-blur-xl rounded-2xl shadow-uq-pop border border-uq-persona animate-uq-rise flex flex-col overflow-hidden" style={{ height: "520px" }}>
      <div className="bg-uq-persona-soft border-b border-uq text-uq px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-full bg-uq-persona text-[color:var(--uq-text-on-accent)] flex items-center justify-center text-sm font-bold flex-shrink-0">
            {chat.personaName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate text-uq">{chat.personaName}</div>
            <div className="font-mono text-[11px] text-uq-2 truncate">{chat.personaRole}</div>
          </div>
        </div>
        <button onClick={onMinimise} className="text-uq-3 hover:text-uq text-xs transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] rounded px-1" aria-label="Minimise">
          — minimise
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 bg-uq-bg2 space-y-2">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.actor === "candidate" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] px-3 py-2 text-sm whitespace-pre-wrap ${
              m.actor === "candidate"
                ? "rounded-2xl rounded-br-md bg-uq-persona text-[color:var(--uq-text-on-accent)]"
                : "rounded-2xl rounded-bl-md bg-uq-elev2 border border-uq text-uq"
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-bl-md text-xs bg-uq-elev2 text-uq-3 italic">typing…</div>
          </div>
        )}
      </div>

      {error && <div className="px-3 py-1 text-xs text-uq-danger-text bg-uq-danger-soft border-t border-uq-danger-line">{error}</div>}

      <div className="border-t border-uq-faint p-2">
        {reachedCap ? (
          <div className="text-xs text-uq-3 text-center py-2">
            This conversation has ended.
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder="Type a reply… (Shift+Enter for newline)"
              maxLength={4000}
              className="flex-1 rounded-md border border-uq bg-uq-glass-subtle px-2 py-1.5 text-sm text-uq placeholder:text-uq-3 resize-none transition-shadow duration-150 focus:outline-none focus:border-[color:var(--uq-persona)] focus:shadow-[0_0_22px_-6px_rgba(183,148,246,0.4)] focus:bg-uq-elev1"
              rows={2}
              disabled={sending}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="px-3 py-2 rounded-md bg-uq-persona text-[color:var(--uq-text-on-accent)] text-sm font-medium transition-all duration-150 hover:brightness-110 active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            >
              Send
            </button>
          </div>
        )}
        <div className="font-mono text-[10px] text-uq-3 mt-1 text-right tabular-nums">
          {candidateTurns} / {chat.maxTurns} turns
        </div>
      </div>
    </div>
  );
}

function MinimisedChatPill({ personaName, onOpen }: { personaName: string; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="fixed bottom-4 right-4 z-50 bg-uq-persona-soft backdrop-blur-xl border border-uq-persona text-uq px-4 py-2 rounded-full shadow-uq-glass text-sm font-medium hover:bg-uq-elev2 transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
    >
      <span className="w-2 h-2 rounded-full bg-uq-persona animate-uq-pulse-glow" />
      Chat with {personaName}
    </button>
  );
}
