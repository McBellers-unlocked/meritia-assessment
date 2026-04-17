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
  if (!scenario) return <div className="max-w-4xl mx-auto p-8 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="text-xs">
        <Link href="/admin/recruitment/scenarios" className="text-[#4B92DB] hover:underline">← Scenarios</Link>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div>
          <h1 className="text-2xl font-semibold text-[#1B2A4A]">{scenario.title || "Untitled scenario"}</h1>
          <div className="text-xs text-slate-500 mt-1">
            <StatusBadge status={scenario.status} />
            <span className="ml-2">
              <code className="bg-slate-100 px-1 rounded">{scenario.slug}</code> · {scenario.tasks.length} task{scenario.tasks.length === 1 ? "" : "s"} · {scenario.defaultTotalMinutes} min
            </span>
          </div>
        </div>
      </div>

      <nav className="mt-6 border-b border-slate-200 flex gap-1">
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

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
        active ? "border-[#1B2A4A] text-[#1B2A4A]" : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "published" ? "bg-emerald-100 text-emerald-800" :
    status === "archived" ? "bg-slate-100 text-slate-600" :
    "bg-amber-100 text-amber-800";
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{status}</span>;
}

function ErrorBox({ error }: { error: string }) {
  return <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">{error}</div>;
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

  const selected = scenario.tasks.find((t) => t.id === selectedTaskId) ?? null;

  return (
    <div className="grid grid-cols-12 gap-4">
      <aside className="col-span-4">
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Tasks</div>
          {scenario.tasks.length === 0 && (
            <div className="text-xs text-slate-500 py-3 text-center">No tasks yet.</div>
          )}
          <ul className="space-y-1">
            {scenario.tasks.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => onSelect(t.id)}
                  className={`w-full text-left px-2 py-2 rounded text-sm ${
                    selectedTaskId === t.id ? "bg-emerald-100 text-emerald-900" : "hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-slate-100 text-slate-600 rounded px-1.5">{t.number}</span>
                    <span className="flex-1 truncate">{t.title || "(untitled)"}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {kindLabel(t.kind)}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="pt-3 mt-3 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Add task</div>
            <div className="space-y-1">
              <AddButton label="Memo + AI investigation" onClick={() => addTask("memo_ai")} disabled={adding} />
              <AddButton label="Email inbox" onClick={() => addTask("email_inbox")} disabled={adding} />
              <AddButton label="Chat (urgent issue)" onClick={() => addTask("chat")} disabled={adding} />
            </div>
            {error && <div className="mt-2 text-xs text-red-700">{error}</div>}
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
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
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
      className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-slate-100 text-slate-700 disabled:opacity-50"
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
    <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[#1B2A4A]">Status: <StatusBadge status={scenario.status} /></h2>
        <p className="text-sm text-slate-600 mt-1">
          {scenario.status === "draft" && "Draft scenarios can't be used for candidate cohorts. Publish when every task is fully authored."}
          {scenario.status === "published" && "This scenario is available in the recruitment assessment creation form."}
          {scenario.status === "archived" && "Archived scenarios are hidden from the cohort picker but are preserved for historical data."}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">
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
            className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:bg-slate-300"
          >
            {busy ? "Validating…" : "Publish scenario"}
          </button>
        )}
        {scenario.status === "published" && (
          <>
            <button
              onClick={() => call("unpublish")}
              disabled={busy}
              className="px-4 py-2 rounded-md bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              Unpublish (back to draft)
            </button>
            <button
              onClick={() => call("archive")}
              disabled={busy}
              className="px-4 py-2 rounded-md bg-slate-600 text-white text-sm font-semibold hover:bg-slate-700 disabled:bg-slate-300"
            >
              Archive
            </button>
          </>
        )}
        {scenario.status === "archived" && (
          <div className="text-sm text-slate-500">To edit this scenario again, unarchive it via the scenarios list.</div>
        )}
      </div>
    </div>
  );
}
