"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import OverviewTab from "@/components/admin/recruit/OverviewTab";
import ExhibitsTab from "@/components/admin/recruit/ExhibitsTab";
import MemoTaskEditor from "@/components/admin/recruit/MemoTaskEditor";
import EmailTaskEditor from "@/components/admin/recruit/EmailTaskEditor";
import ChatTaskEditor from "@/components/admin/recruit/ChatTaskEditor";
import type {
  EditorScenario,
  EditorTask,
  EditorTaskKind,
} from "@/components/admin/recruit/scenarioEditorTypes";

/**
 * Tabbed scenario editor: Overview | Tasks | Exhibits | Publish.
 * Loads the scenario once on mount, then re-fetches after any mutation so
 * child components always see the authoritative server state (task lists,
 * nested emails, chat scripts).
 */
export default function ScenarioEditorPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [scenario, setScenario] = useState<EditorScenario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "tasks" | "exhibits" | "publish">("overview");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/login");
  }, [authStatus, router]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/recruitment/scenarios/${params.id}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setScenario(body.scenario);
      // Keep selection if still present; otherwise clear.
      setSelectedTaskId((prev) => {
        if (!prev) return body.scenario.tasks[0]?.id ?? null;
        return body.scenario.tasks.some((t: EditorTask) => t.id === prev)
          ? prev
          : body.scenario.tasks[0]?.id ?? null;
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [params.id]);

  useEffect(() => { void reload(); }, [reload]);

  if (error) return <div className="max-w-4xl mx-auto p-8"><ErrorBox error={error} /></div>;
  if (!scenario) return <div className="max-w-4xl mx-auto p-8 text-sm text-uq-3"><span className="font-mono text-[11px] uppercase tracking-[0.18em] text-uq-3 animate-pulse">Loading…</span></div>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 animate-uq-rise">
      <div className="text-xs">
        <Link href="/admin/recruitment/scenarios" className="font-mono text-[11px] uppercase tracking-[0.14em] text-uq-accent hover:text-uq-accent-hover hover:underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md">← Scenarios</Link>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-uq">{scenario.title || "Untitled scenario"}</h1>
          <div className="text-xs text-uq-3 mt-1">
            <StatusBadge status={scenario.status} />
            <span className="ml-2">
              <code className="font-mono text-xs bg-uq-glass-subtle border border-uq-faint text-uq-cyan px-1.5 rounded">{scenario.slug}</code> · {scenario.tasks.length} task{scenario.tasks.length === 1 ? "" : "s"} · {scenario.defaultTotalMinutes} min
            </span>
          </div>
        </div>
      </div>

      <NextStepsBanner
        scenario={scenario}
        onJumpToPublish={() => setTab("publish")}
      />

      <nav className="mt-6 border-b border-uq flex gap-1">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>Overview</TabButton>
        <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")}>Tasks ({scenario.tasks.length})</TabButton>
        <TabButton active={tab === "exhibits"} onClick={() => setTab("exhibits")}>Exhibits ({scenario.exhibits.length})</TabButton>
        <TabButton active={tab === "publish"} onClick={() => setTab("publish")}>Publish</TabButton>
      </nav>

      <div className="mt-6">
        {tab === "overview" && (
          <OverviewTab scenario={scenario} onSaved={(s) => setScenario(s)} />
        )}
        {tab === "tasks" && (
          <TasksTab
            scenario={scenario}
            selectedTaskId={selectedTaskId}
            onSelect={setSelectedTaskId}
            onChanged={reload}
          />
        )}
        {tab === "exhibits" && (
          <ExhibitsTab scenario={scenario} onChanged={reload} />
        )}
        {tab === "publish" && (
          <PublishTab scenario={scenario} onChanged={reload} />
        )}
      </div>
    </div>
  );
}

/**
 * Surfaces "what's next?" guidance after the wizard or any time a
 * scenario is in a state that can't yet take candidates. Common cases:
 *  - status=draft → must publish first
 *  - status=published with no assessments → ready to use, create one
 *  - status=published with assessments → nothing to nudge; banner hides
 */
function NextStepsBanner({
  scenario,
  onJumpToPublish,
}: {
  scenario: EditorScenario;
  onJumpToPublish: () => void;
}) {
  const isDraft = scenario.status === "draft";
  const noTasks = scenario.tasks.length === 0;
  const noAssessments = scenario._count.assessments === 0;

  if (!isDraft && !noAssessments) return null;

  const baseClass =
    "mt-4 rounded-lg border px-4 py-3 text-sm flex items-start gap-3";

  if (isDraft) {
    return (
      <div
        className={`${baseClass} bg-[color:var(--uq-warn-soft)] border-[color:var(--uq-warn-line)] text-[color:var(--uq-warn-text)]`}
      >
        <span aria-hidden className="text-base leading-tight">📝</span>
        <div className="flex-1">
          <div className="font-semibold text-uq">Next step: publish</div>
          <div className="mt-0.5 text-uq-2">
            This scenario is a draft. Candidates can&apos;t take it until
            it&apos;s published.{noTasks && " Add at least one task first."}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={onJumpToPublish}
              className="text-xs px-2.5 py-1 rounded-md border border-[color:var(--uq-warn-line)] bg-[color:var(--uq-warn-soft)] text-[color:var(--uq-warn-text)] hover:bg-uq-elev2 font-semibold transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            >
              Open Publish tab →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Published but no assessment yet
  return (
    <div
      className={`${baseClass} bg-uq-accent-soft border-uq-accent text-uq`}
    >
      <span aria-hidden className="text-base leading-tight">✅</span>
      <div className="flex-1">
        <div className="font-semibold text-uq">Ready to use</div>
        <div className="mt-0.5 text-uq-2">
          The scenario is published. To run candidates through it, create an
          assessment that uses it.
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href="/admin/recruitment"
            className="text-xs px-2.5 py-1 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px inline-flex items-center focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
          >
            Create an assessment →
          </Link>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md ${
        active ? "border-uq-accent text-uq" : "border-transparent text-uq-3 hover:text-uq hover:bg-uq-elev2"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "published" ? "bg-[color:var(--uq-success-soft)] border-[color:var(--uq-success-line)] text-[color:var(--uq-success-text)]" :
    status === "archived" ? "border-uq bg-uq-elev2 text-uq-2" :
    "bg-[color:var(--uq-warn-soft)] border-[color:var(--uq-warn-line)] text-[color:var(--uq-warn-text)]";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${cls}`}>{status}</span>;
}

function ErrorBox({ error }: { error: string }) {
  return <div className="rounded-md px-3 py-2 text-sm border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">{error}</div>;
}

// ------------------------------------------------------------------
// Tasks tab: list on left, editor on right. Kind dispatch in the editor.
// ------------------------------------------------------------------

function TasksTab({
  scenario,
  selectedTaskId,
  onSelect,
  onChanged,
}: {
  scenario: EditorScenario;
  selectedTaskId: string | null;
  onSelect: (id: string | null) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [adding, setAdding] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTask = async (kind: EditorTaskKind) => {
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/recruitment/scenarios/${scenario.id}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }),
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      await onChanged();
      onSelect(body.task.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  // Re-order via PATCH /tasks/[taskId] with a new `number`. The endpoint
  // handles the swap in a transaction so candidate-facing ordinals stay
  // unique. Heads-up: candidates' stored taskNumber references DON'T move
  // with the task, so reordering after candidates have started will scramble
  // their saved memos and chat trails.
  const reorderTask = async (taskId: string, currentNumber: number, dir: "up" | "down") => {
    const target = dir === "up" ? currentNumber - 1 : currentNumber + 1;
    if (target < 1 || target > scenario.tasks.length) return;
    setReordering(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/recruitment/scenarios/${scenario.id}/tasks/${taskId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ number: target }),
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReordering(false);
    }
  };

  const selected = scenario.tasks.find((t) => t.id === selectedTaskId) ?? null;

  return (
    <div className="grid grid-cols-12 gap-4">
      <aside className="col-span-4">
        <div className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass p-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3 mb-2">Tasks</div>
          {scenario.tasks.length === 0 && (
            <div className="text-xs text-uq-3 py-3 text-center">No tasks yet.</div>
          )}
          <ul className="space-y-1">
            {scenario.tasks.map((t, idx) => {
              const canMoveUp = idx > 0;
              const canMoveDown = idx < scenario.tasks.length - 1;
              return (
                <li key={t.id} className="flex items-stretch gap-1">
                  <button
                    onClick={() => onSelect(t.id)}
                    className={`flex-1 min-w-0 text-left px-2 py-2 rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] ${
                      selectedTaskId === t.id ? "bg-uq-accent-soft border border-uq-accent text-uq" : "border border-transparent hover:bg-uq-elev2 text-uq-2"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs bg-uq-elev2 border border-uq-faint text-uq-2 rounded px-1.5">{t.number}</span>
                      <span className="flex-1 truncate">{t.title || "(untitled)"}</span>
                    </div>
                    <div className="text-xs text-uq-3 mt-0.5">
                      {kindLabel(t.kind)}
                    </div>
                  </button>
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => void reorderTask(t.id, t.number, "up")}
                      disabled={!canMoveUp || reordering}
                      title={canMoveUp ? `Move "${t.title || "task"}" up` : "Already at the top"}
                      aria-label={`Move task ${t.number} up`}
                      className="px-1.5 py-1 rounded-md text-xs text-uq-3 hover:text-uq hover:bg-uq-elev2 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed leading-none transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => void reorderTask(t.id, t.number, "down")}
                      disabled={!canMoveDown || reordering}
                      title={canMoveDown ? `Move "${t.title || "task"}" down` : "Already at the bottom"}
                      aria-label={`Move task ${t.number} down`}
                      className="px-1.5 py-1 rounded-md text-xs text-uq-3 hover:text-uq hover:bg-uq-elev2 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed leading-none transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
                    >
                      ▼
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="pt-3 mt-3 border-t border-uq-faint">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3 mb-2">Add task</div>
            <div className="space-y-1">
              <AddButton label="Memo + AI investigation" onClick={() => addTask("memo_ai")} disabled={adding} />
              <AddButton label="Email inbox" onClick={() => addTask("email_inbox")} disabled={adding} />
              <AddButton label="Chat (urgent issue)" onClick={() => addTask("chat")} disabled={adding} />
            </div>
            {error && <div className="mt-2 text-xs text-[color:var(--uq-danger-text)]">{error}</div>}
          </div>
        </div>
      </aside>

      <section className="col-span-8">
        {selected ? (
          <TaskEditorFor
            scenario={scenario}
            task={selected}
            onSaved={() => onChanged()}
            onDeleted={() => { onSelect(null); void onChanged(); }}
          />
        ) : (
          <div className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass p-8 text-center text-sm text-uq-3">
            Select or add a task to edit.
          </div>
        )}
      </section>
    </div>
  );
}

function AddButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left text-sm px-2 py-1.5 rounded-md text-uq-2 transition-colors hover:bg-uq-elev2 hover:text-uq disabled:opacity-50 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
    >
      + {label}
    </button>
  );
}

function kindLabel(kind: EditorTaskKind): string {
  switch (kind) {
    case "memo_ai": return "Memo + AI investigation";
    case "email_inbox": return "Email inbox";
    case "chat": return "Chat (urgent issue)";
  }
}

function TaskEditorFor({
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
  switch (task.kind) {
    case "memo_ai":
      return <MemoTaskEditor scenario={scenario} task={task} onSaved={onSaved} onDeleted={onDeleted} />;
    case "email_inbox":
      return <EmailTaskEditor scenario={scenario} task={task} onSaved={onSaved} onDeleted={onDeleted} />;
    case "chat":
      return <ChatTaskEditor scenario={scenario} task={task} onSaved={onSaved} onDeleted={onDeleted} />;
  }
}

// ------------------------------------------------------------------
// Publish tab: server-side validation + status transitions.
// ------------------------------------------------------------------

function PublishTab({
  scenario,
  onChanged,
}: {
  scenario: EditorScenario;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[] | null>(null);

  const call = async (action: "publish" | "unpublish" | "archive") => {
    setBusy(true);
    setError(null);
    setDetails(null);
    try {
      const res = await fetch(
        `/api/admin/recruitment/scenarios/${scenario.id}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || `HTTP ${res.status}`);
        if (Array.isArray(body.details)) setDetails(body.details);
        return;
      }
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-uq">Status: <StatusBadge status={scenario.status} /></h2>
        <p className="text-sm text-uq-2 mt-1">
          {scenario.status === "draft" && "Draft scenarios can't be used for candidate cohorts. Publish when every task is fully authored."}
          {scenario.status === "published" && "This scenario is available in the recruitment assessment creation form."}
          {scenario.status === "archived" && "Archived scenarios are hidden from the cohort picker but are preserved for historical data."}
        </p>
      </div>

      {error && (
        <div className="rounded-md px-3 py-2 text-sm border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">
          <div className="font-medium">{error}</div>
          {details && details.length > 0 && (
            <ul className="list-disc list-inside mt-2 text-xs">
              {details.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        {scenario.status === "draft" && (
          <button
            onClick={() => call("publish")}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
          >
            {busy ? "Validating…" : "Publish scenario"}
          </button>
        )}
        {scenario.status === "published" && (
          <>
            <button
              onClick={() => call("unpublish")}
              disabled={busy}
              className="px-4 py-2 rounded-lg border border-uq-strong bg-uq-glass-subtle text-uq text-sm font-medium transition-colors hover:border-uq-accent hover:bg-uq-accent-soft hover:text-uq disabled:opacity-50 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            >
              Unpublish (back to draft)
            </button>
            <button
              onClick={() => call("archive")}
              disabled={busy}
              className="px-4 py-2 rounded-lg border border-uq bg-uq-glass-subtle text-uq-2 text-sm font-medium transition-colors hover:border-uq-strong hover:bg-uq-elev2 hover:text-uq disabled:opacity-50 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            >
              Archive
            </button>
          </>
        )}
        {scenario.status === "archived" && (
          <div className="text-sm text-uq-3">To edit this scenario again, unarchive it via the scenarios list.</div>
        )}
      </div>
    </div>
  );
}
