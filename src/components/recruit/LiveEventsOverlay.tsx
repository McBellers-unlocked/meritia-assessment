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
  // Positioned above the existing chat-drawer rail (which lives at right-0).
  // The existing UI occupies ~48px; we offset by 56px to leave room but stay
  // on the same edge for a cohesive look.
  return (
    <div className="fixed top-1/2 -translate-y-1/2 right-2 z-30 flex flex-col gap-2">
      {emailsVisible && (
        <button
          onClick={onOpenInbox}
          className="relative w-11 h-11 rounded-full bg-white border border-slate-300 shadow hover:bg-slate-50 flex items-center justify-center"
          title="Inbox"
          aria-label={`Inbox${unreadEmails ? `, ${unreadEmails} unread` : ""}`}
        >
          <EmailIcon />
          {unreadEmails > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadEmails}
            </span>
          )}
        </button>
      )}
      {hasChat && (
        <button
          onClick={onOpenChat}
          className={`relative w-11 h-11 rounded-full border shadow flex items-center justify-center ${
            chatActive ? "bg-purple-600 border-purple-700 text-white" : "bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
          }`}
          title="Chat"
          aria-label="Open chat"
        >
          <ChatIcon />
          {!chatActive && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-purple-500 animate-pulse" />
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
// Inbox drawer.
// -------------------------------------------------------------------------

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

  return (
    <div className="fixed inset-y-0 right-0 w-[560px] max-w-full bg-white shadow-2xl border-l border-slate-200 z-40 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div>
          <div className="text-sm font-semibold text-[#1B2A4A]">Inbox</div>
          <div className="text-xs text-slate-500">{emails.length} message{emails.length === 1 ? "" : "s"}</div>
        </div>
        <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800" aria-label="Close inbox">✕</button>
      </div>

      <div className="flex flex-1 min-h-0">
        <ul className="w-48 border-r border-slate-200 overflow-y-auto">
          {emails.map((e) => {
            const isSelected = selected?.id === e.id;
            const unread = e.response === null;
            return (
              <li key={e.id}>
                <button
                  onClick={() => onSelect(e.id)}
                  className={`w-full text-left px-3 py-2 text-xs border-b border-slate-100 ${
                    isSelected ? "bg-emerald-50" : "hover:bg-slate-50"
                  }`}
                >
                  <div className={`truncate ${unread ? "font-semibold text-[#1B2A4A]" : "text-slate-600"}`}>{e.senderName}</div>
                  <div className={`truncate ${unread ? "text-slate-700" : "text-slate-500"}`}>{e.subject}</div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {unread ? "Unread" : `✓ ${e.response?.action}`}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <EmailReader
              key={selected.id}
              token={token}
              email={selected}
              onResponded={onResponded}
            />
          ) : (
            <div className="p-6 text-sm text-slate-500">Select a message to read.</div>
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

  useEffect(() => {
    setReplyBody(email.response?.replyBody ?? "");
    setError(null);
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

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="text-xs text-slate-500">{new Date(email.deliveredAt).toLocaleString()}</div>
        <div className="text-lg font-semibold text-[#1B2A4A] mt-1">{email.subject}</div>
        <div className="text-sm text-slate-600 mt-1">
          From <span className="font-medium">{email.senderName}</span> &lt;{email.senderEmail}&gt;
        </div>
      </div>

      <div
        className="prose prose-sm max-w-none border border-slate-200 rounded-md p-3 bg-slate-50"
        dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
      />

      {alreadyResponded && (
        <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded px-3 py-2">
          You {email.response!.action === "replied" ? "replied" : email.response!.action === "ignored" ? "chose not to respond" : "flagged this"} at {new Date(email.response!.respondedAt).toLocaleTimeString()}.
          {email.response!.action === "replied" && " Your reply is editable below."}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Your reply</label>
        <textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          placeholder="Type your reply here, or use Ignore / Flag if you don't want to respond."
          maxLength={10_000}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm h-40"
        />
        <div className="text-[10px] text-slate-400 mt-1 text-right">{replyBody.length} / 10,000</div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">{error}</div>}

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => submit("flagged")}
          disabled={submitting}
          className="px-3 py-1.5 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Flag
        </button>
        <button
          onClick={() => submit("ignored")}
          disabled={submitting}
          className="px-3 py-1.5 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Ignore
        </button>
        <button
          onClick={() => submit("replied")}
          disabled={submitting || !replyBody.trim()}
          className="px-4 py-1.5 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338] disabled:bg-slate-300"
        >
          {submitting ? "Sending…" : alreadyResponded && email.response?.action === "replied" ? "Update reply" : "Send reply"}
        </button>
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
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-full bg-white rounded-xl shadow-2xl border border-purple-300 flex flex-col overflow-hidden" style={{ height: "520px" }}>
      <div className="bg-purple-700 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-full bg-purple-500 flex items-center justify-center text-sm font-bold flex-shrink-0">
            {chat.personaName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{chat.personaName}</div>
            <div className="text-xs text-purple-200 truncate">{chat.personaRole}</div>
          </div>
        </div>
        <button onClick={onMinimise} className="text-purple-200 hover:text-white text-xs" aria-label="Minimise">
          — minimise
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 bg-slate-50 space-y-2">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.actor === "candidate" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
              m.actor === "candidate"
                ? "bg-[#1B2A4A] text-white rounded-br-sm"
                : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="max-w-[80%] px-3 py-2 rounded-lg text-xs bg-slate-100 text-slate-500 italic">typing…</div>
          </div>
        )}
      </div>

      {error && <div className="px-3 py-1 text-xs text-red-700 bg-red-50 border-t border-red-200">{error}</div>}

      <div className="border-t border-slate-200 p-2">
        {reachedCap ? (
          <div className="text-xs text-slate-500 text-center py-2">
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
              className="flex-1 border border-slate-300 rounded-md px-2 py-1.5 text-sm resize-none"
              rows={2}
              disabled={sending}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="px-3 py-2 rounded-md bg-purple-700 text-white text-sm font-semibold hover:bg-purple-800 disabled:bg-slate-300"
            >
              Send
            </button>
          </div>
        )}
        <div className="text-[10px] text-slate-400 mt-1 text-right">
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
      className="fixed bottom-4 right-4 z-50 bg-purple-700 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium hover:bg-purple-800 flex items-center gap-2"
    >
      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
      Chat with {personaName}
    </button>
  );
}
