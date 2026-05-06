"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface GeneratedTaskDraft {
  title: string;
  briefMarkdown: string;
  exhibitTitle: string;
  exhibitHtml: string;
  deliverableLabel: string;
  deliverablePlaceholder: string;
  totalMarks: number;
  themeSummary: string;
}

type Step = "upload" | "configure" | "review";

const MAX_TASK_COUNT = 3;

export default function GenerateFromJdPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();

  const [step, setStep] = useState<Step>("upload");

  // Upload step
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [jdText, setJdText] = useState("");
  const [filename, setFilename] = useState("");

  // Configure step. Default org is IDSC for the current demo cohort —
  // edit per scenario if you're authoring for a different organisation.
  const DEFAULT_ORG = "International Digital Services Centre (IDSC), Geneva";
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [organisation, setOrganisation] = useState(DEFAULT_ORG);
  const [positionTitle, setPositionTitle] = useState("");
  const [defaultTotalMinutes, setDefaultTotalMinutes] = useState("90");
  const [taskCount, setTaskCount] = useState(2);

  // Generation state — drafts keyed by index, status per index so we can
  // show partial progress while later tasks are still in flight.
  const [tasks, setTasks] = useState<(GeneratedTaskDraft | null)[]>([]);
  const [taskStatuses, setTaskStatuses] = useState<
    ("pending" | "generating" | "ready" | "error")[]
  >([]);
  const [taskErrors, setTaskErrors] = useState<(string | null)[]>([]);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/login");
  }, [authStatus, router]);

  // Auto-slug from title until the user manually edits it.
  useEffect(() => {
    if (slugTouched) return;
    setSlug(deriveSlug(title));
  }, [title, slugTouched]);

  const onFileSelected = async (file: File) => {
    setParseError(null);
    setParsing(true);
    setJdText("");
    setFilename(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        "/api/admin/recruitment/scenarios/from-jd/parse",
        { method: "POST", body: fd }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setJdText(body.text);
      // The /parse endpoint runs a small Claude call to extract the actual
      // job title (regex heuristics catch section headers like "Position
      // Description" instead). Seed both Scenario Title and Position Title
      // from that — the admin can override either on the next step.
      const suggested =
        typeof body.suggestedJobTitle === "string" && body.suggestedJobTitle
          ? body.suggestedJobTitle
          : null;
      if (suggested) {
        if (!title) setTitle(suggested);
        if (!positionTitle) setPositionTitle(suggested);
      }
      setStep("configure");
    } catch (e) {
      setParseError((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const startGeneration = async () => {
    setStep("review");
    const initialTasks: (GeneratedTaskDraft | null)[] = Array.from(
      { length: taskCount },
      () => null
    );
    const initialStatuses: ("pending" | "generating" | "ready" | "error")[] =
      Array.from({ length: taskCount }, (_, i) =>
        i === 0 ? "generating" : "pending"
      );
    setTasks(initialTasks);
    setTaskStatuses(initialStatuses);
    setTaskErrors(Array.from({ length: taskCount }, () => null));

    // Sequence-then-parallel: task 1 runs alone so the JD prefix is cached
    // before parallel calls fire (concurrent first calls would each pay the
    // cache-write premium; reads only become possible after the first
    // response begins streaming). Tasks 2..N then run in parallel and read
    // the cached prefix, with priorThemes built from task 1.
    let firstTask: GeneratedTaskDraft | null;
    try {
      firstTask = await generateOne({
        jdText,
        positionTitle,
        organisation,
        taskIndex: 1,
        taskCount,
        priorThemes: [],
      });
      setTasks((prev) => withAt(prev, 0, firstTask!));
      setTaskStatuses((prev) => withAt(prev, 0, "ready"));
    } catch (e) {
      setTaskErrors((prev) => withAt(prev, 0, (e as Error).message));
      setTaskStatuses((prev) => withAt(prev, 0, "error"));
      // If task 1 failed, mark the rest pending → error: there's no theme
      // context to drive them, and we don't want to silently fan out.
      setTaskStatuses((prev) =>
        prev.map((s, i) => (i > 0 ? "error" : s))
      );
      setTaskErrors((prev) =>
        prev.map((err, i) => (i > 0 ? "Task 1 failed; cannot continue." : err))
      );
      return;
    }

    if (taskCount === 1) return;

    // Mark remaining as generating, fire in parallel.
    setTaskStatuses((prev) =>
      prev.map((s, i) => (i >= 1 ? "generating" : s))
    );

    await Promise.all(
      Array.from({ length: taskCount - 1 }, (_, k) => {
        const idx = k + 1; // zero-based index in the array (task index + 1 in 1-based)
        return generateOne({
          jdText,
          positionTitle,
          organisation,
          taskIndex: idx + 1,
          taskCount,
          priorThemes: [firstTask!.themeSummary],
        })
          .then((t) => {
            setTasks((prev) => withAt(prev, idx, t));
            setTaskStatuses((prev) => withAt(prev, idx, "ready"));
          })
          .catch((e: Error) => {
            setTaskErrors((prev) => withAt(prev, idx, e.message));
            setTaskStatuses((prev) => withAt(prev, idx, "error"));
          });
      })
    );
  };

  const regenerateTask = async (idx: number) => {
    setRegeneratingIndex(idx);
    setTaskErrors((prev) => withAt(prev, idx, null));
    setTaskStatuses((prev) => withAt(prev, idx, "generating"));
    try {
      // Pass other tasks' themeSummaries so the regenerated task doesn't
      // duplicate them (excluding the slot being regenerated).
      const priorThemes = tasks
        .map((t, i) => (i !== idx && t ? t.themeSummary : null))
        .filter((s): s is string => Boolean(s));
      const fresh = await generateOne({
        jdText,
        positionTitle,
        organisation,
        taskIndex: idx + 1,
        taskCount,
        priorThemes,
      });
      setTasks((prev) => withAt(prev, idx, fresh));
      setTaskStatuses((prev) => withAt(prev, idx, "ready"));
    } catch (e) {
      setTaskErrors((prev) => withAt(prev, idx, (e as Error).message));
      setTaskStatuses((prev) => withAt(prev, idx, "error"));
    } finally {
      setRegeneratingIndex(null);
    }
  };

  const allReady = useMemo(
    () =>
      taskStatuses.length > 0 &&
      taskStatuses.every((s) => s === "ready"),
    [taskStatuses]
  );
  const anyGenerating = useMemo(
    () => taskStatuses.some((s) => s === "generating"),
    [taskStatuses]
  );

  const saveScenario = async () => {
    if (!allReady) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/recruitment/scenarios/from-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          organisation: organisation.trim(),
          positionTitle: positionTitle.trim(),
          defaultTotalMinutes: Number(defaultTotalMinutes) || 90,
          jdText,
          tasks: tasks.filter(Boolean),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      router.push(`/admin/recruitment/scenarios/${body.scenario.id}`);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const canConfigure =
    title.trim() && slug.trim() && organisation.trim() && positionTitle.trim();

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="text-xs">
        <Link
          href="/admin/recruitment/scenarios"
          className="text-[#4B92DB] hover:underline"
        >
          ← Scenarios
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-[#1B2A4A] mt-2">
        Generate from job description
      </h1>
      <p className="text-sm text-slate-600 mt-1 mb-6">
        Upload a JD; Claude Opus 4.7 drafts up to {MAX_TASK_COUNT} tasks — each
        with a brief, an industry-matched exhibit, and a deliverable — for you
        to review and tweak.
      </p>

      <Stepper step={step} />

      {step === "upload" && (
        <UploadStep
          parsing={parsing}
          parseError={parseError}
          onFileSelected={onFileSelected}
        />
      )}

      {step === "configure" && (
        <ConfigureStep
          jdText={jdText}
          filename={filename}
          title={title}
          setTitle={setTitle}
          slug={slug}
          setSlug={(v) => {
            setSlugTouched(true);
            setSlug(v);
          }}
          organisation={organisation}
          setOrganisation={setOrganisation}
          positionTitle={positionTitle}
          setPositionTitle={setPositionTitle}
          defaultTotalMinutes={defaultTotalMinutes}
          setDefaultTotalMinutes={setDefaultTotalMinutes}
          taskCount={taskCount}
          setTaskCount={setTaskCount}
          canSubmit={Boolean(canConfigure)}
          onBack={() => setStep("upload")}
          onSubmit={() => void startGeneration()}
        />
      )}

      {step === "review" && (
        <ReviewStep
          tasks={tasks}
          statuses={taskStatuses}
          errors={taskErrors}
          regeneratingIndex={regeneratingIndex}
          onRegenerate={(i) => void regenerateTask(i)}
          allReady={allReady}
          anyGenerating={anyGenerating}
          saving={saving}
          saveError={saveError}
          onBack={() => setStep("configure")}
          onSave={() => void saveScenario()}
        />
      )}
    </div>
  );
}

/* ---------------- helpers ---------------- */

function deriveSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

function withAt<T>(arr: T[], idx: number, value: T): T[] {
  const next = arr.slice();
  next[idx] = value;
  return next;
}

async function generateOne(input: {
  jdText: string;
  positionTitle: string;
  organisation: string;
  taskIndex: number;
  taskCount: number;
  priorThemes: string[];
}): Promise<GeneratedTaskDraft> {
  const res = await fetch(
    "/api/admin/recruitment/scenarios/from-jd/generate-task",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );

  // Validation errors come back as plain JSON (status != 200). The
  // happy path is text/event-stream — `result` and `error` events
  // terminate the stream and carry a JSON payload.
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("text/event-stream")) {
    const raw = await res.text().catch(() => "");
    if (!raw) {
      throw new Error(
        `Server returned an empty ${res.ok ? "OK" : "HTTP " + res.status} response. The generation may have timed out at the platform — try a shorter JD or fewer tasks.`
      );
    }
    let parsed: { error?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        `Server returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`
      );
    }
    throw new Error(parsed.error || `HTTP ${res.status}`);
  }

  if (!res.body) {
    throw new Error("Streaming not supported in this browser.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let task: GeneratedTaskDraft | null = null;
  let errorMessage: string | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line ("\n\n"). Comments
      // (heartbeats) start with ":" and we skip them.
      let split: number;
      while ((split = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);

        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of block.split("\n")) {
          if (!line || line.startsWith(":")) continue;
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        }
        if (dataLines.length === 0) continue;
        const dataStr = dataLines.join("\n");

        if (eventName === "result") {
          try {
            const payload = JSON.parse(dataStr);
            if (payload && payload.task) task = payload.task;
          } catch {
            errorMessage = "Server returned an unparseable result event.";
          }
        } else if (eventName === "error") {
          try {
            const payload = JSON.parse(dataStr);
            errorMessage = payload?.error || "Generation failed";
          } catch {
            errorMessage = dataStr || "Generation failed";
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (errorMessage) throw new Error(errorMessage);
  if (!task) {
    throw new Error(
      "Stream ended without a result. The generation likely hit the platform timeout — try a shorter JD or fewer tasks."
    );
  }
  return task;
}

/* ---------------- step components ---------------- */

function Stepper({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload JD" },
    { key: "configure", label: "Configure" },
    { key: "review", label: "Review & save" },
  ];
  const activeIdx = items.findIndex((i) => i.key === step);
  return (
    <ol className="flex items-center gap-2 mb-6 text-xs text-slate-600">
      {items.map((it, i) => (
        <li key={it.key} className="flex items-center gap-2">
          <span
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${
              i < activeIdx
                ? "bg-[#1B2A4A] text-white"
                : i === activeIdx
                ? "bg-[#4B92DB] text-white"
                : "bg-slate-200 text-slate-500"
            }`}
          >
            {i + 1}
          </span>
          <span
            className={
              i === activeIdx ? "font-semibold text-[#1B2A4A]" : ""
            }
          >
            {it.label}
          </span>
          {i < items.length - 1 && (
            <span className="text-slate-300 mx-1">━━</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function UploadStep({
  parsing,
  parseError,
  onFileSelected,
}: {
  parsing: boolean;
  parseError: string | null;
  onFileSelected: (file: File) => void;
}) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 p-6">
      <h2 className="text-base font-semibold text-[#1B2A4A]">
        Upload the job description
      </h2>
      <p className="text-sm text-slate-600 mt-1">
        PDF or DOCX, up to 10MB. The text is extracted server-side and sent to
        Claude Opus 4.7 alongside the role context. The original file isn&apos;t
        stored — only the parsed text is saved with the scenario, for use when
        you regenerate a task later.
      </p>

      <label className="mt-5 block border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-[#4B92DB] hover:bg-slate-50 transition">
        <div className="text-sm font-medium text-[#1B2A4A]">
          {parsing ? "Parsing…" : "Choose a PDF or DOCX file"}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          or drop one here (click to browse)
        </div>
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={parsing}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileSelected(f);
            // Allow re-selecting the same file later
            e.target.value = "";
          }}
          className="hidden"
        />
      </label>

      {parseError && (
        <div className="mt-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">
          {parseError}
        </div>
      )}
    </section>
  );
}

function ConfigureStep({
  jdText,
  filename,
  title,
  setTitle,
  slug,
  setSlug,
  organisation,
  setOrganisation,
  positionTitle,
  setPositionTitle,
  defaultTotalMinutes,
  setDefaultTotalMinutes,
  taskCount,
  setTaskCount,
  canSubmit,
  onBack,
  onSubmit,
}: {
  jdText: string;
  filename: string;
  title: string;
  setTitle: (v: string) => void;
  slug: string;
  setSlug: (v: string) => void;
  organisation: string;
  setOrganisation: (v: string) => void;
  positionTitle: string;
  setPositionTitle: (v: string) => void;
  defaultTotalMinutes: string;
  setDefaultTotalMinutes: (v: string) => void;
  taskCount: number;
  setTaskCount: (n: number) => void;
  canSubmit: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const tokenEstimate = Math.round(jdText.length / 4); // rough char→token heuristic
  return (
    <section className="bg-white rounded-lg border border-slate-200 p-6 space-y-5">
      <div>
        <div className="text-xs uppercase tracking-wider text-[#4B92DB] font-semibold">
          Parsed JD
        </div>
        <div className="text-sm text-slate-600">
          <span className="font-mono">{filename}</span> · {jdText.length.toLocaleString()} characters
          (~{tokenEstimate.toLocaleString()} tokens)
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-[#4B92DB] hover:underline">
            Preview text
          </summary>
          <pre className="mt-2 max-h-64 overflow-y-auto bg-slate-50 border border-slate-200 rounded p-3 text-xs whitespace-pre-wrap font-mono text-slate-700">
            {jdText.slice(0, 4000)}
            {jdText.length > 4000 && "\n\n…[truncated for preview]"}
          </pre>
        </details>
      </div>

      <hr className="border-slate-200" />

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm sm:col-span-2">
          <span className="text-slate-600">Scenario title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Cybersecurity Officer (P3) — Technical Assessment"
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-slate-600">URL slug</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="cyber-officer-p3-2026"
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
          />
          <span className="text-xs text-slate-500 mt-1 block">
            Candidate URL will be{" "}
            <code className="bg-slate-100 px-1 rounded">
              /assess/{slug || "..."}
            </code>
          </span>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Organisation</span>
          <input
            value={organisation}
            onChange={(e) => setOrganisation(e.target.value)}
            placeholder="International Digital Services Centre (IDSC), Geneva"
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Position title</span>
          <input
            value={positionTitle}
            onChange={(e) => setPositionTitle(e.target.value)}
            placeholder="Cybersecurity Officer (P3)"
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Default total minutes</span>
          <input
            type="number"
            value={defaultTotalMinutes}
            onChange={(e) => setDefaultTotalMinutes(e.target.value)}
            min={5}
            max={480}
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Number of tasks</span>
          <select
            value={taskCount}
            onChange={(e) => setTaskCount(Number(e.target.value))}
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
          >
            {Array.from({ length: MAX_TASK_COUNT }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} task{n === 1 ? "" : "s"}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500 mt-1 block">
            Each is generated as a memo + AI investigation task. Add other task
            kinds (email inbox, chat) afterwards in the standard editor.
          </span>
        </label>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back
        </button>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="px-4 py-2 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338] disabled:bg-slate-300"
        >
          Generate tasks
        </button>
      </div>
    </section>
  );
}

function ReviewStep({
  tasks,
  statuses,
  errors,
  regeneratingIndex,
  onRegenerate,
  allReady,
  anyGenerating,
  saving,
  saveError,
  onBack,
  onSave,
}: {
  tasks: (GeneratedTaskDraft | null)[];
  statuses: ("pending" | "generating" | "ready" | "error")[];
  errors: (string | null)[];
  regeneratingIndex: number | null;
  onRegenerate: (i: number) => void;
  allReady: boolean;
  anyGenerating: boolean;
  saving: boolean;
  saveError: string | null;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-[#1B2A4A]">
          Generated tasks
        </h2>
        <div className="text-xs text-slate-500">
          {statuses.filter((s) => s === "ready").length} of {statuses.length} ready
        </div>
      </div>

      {tasks.map((t, i) => (
        <TaskCard
          key={i}
          index={i}
          task={t}
          status={statuses[i]}
          error={errors[i]}
          regenerating={regeneratingIndex === i}
          onRegenerate={() => onRegenerate(i)}
        />
      ))}

      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">
          {saveError}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          disabled={anyGenerating || saving}
          className="text-sm text-slate-600 hover:text-slate-900 disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          onClick={onSave}
          disabled={!allReady || saving}
          className="px-4 py-2 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338] disabled:bg-slate-300"
        >
          {saving ? "Saving…" : "Save scenario and continue editing"}
        </button>
      </div>
    </section>
  );
}

function TaskCard({
  index,
  task,
  status,
  error,
  regenerating,
  onRegenerate,
}: {
  index: number;
  task: GeneratedTaskDraft | null;
  status: "pending" | "generating" | "ready" | "error";
  error: string | null;
  regenerating: boolean;
  onRegenerate: () => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-xs bg-slate-200 text-slate-700 rounded px-2 py-0.5">
            Task {index + 1}
          </span>
          {status === "ready" && task && (
            <span className="text-sm font-semibold text-[#1B2A4A] truncate">
              {task.title}
            </span>
          )}
          {status === "pending" && (
            <span className="text-xs text-slate-500 italic">Queued…</span>
          )}
          {status === "generating" && (
            <span className="text-xs text-[#4B92DB] italic flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#4B92DB] animate-pulse" />
              Generating…
            </span>
          )}
          {status === "error" && (
            <span className="text-xs text-red-700 italic">Failed</span>
          )}
        </div>
        {status === "ready" && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="text-xs px-2.5 py-1 rounded border border-slate-300 hover:bg-white text-slate-700 disabled:opacity-50"
            title="Discard this draft and generate a new one"
          >
            {regenerating ? "Regenerating…" : "↻ Regenerate"}
          </button>
        )}
        {status === "error" && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="text-xs px-2.5 py-1 rounded border border-red-300 hover:bg-red-50 text-red-700 disabled:opacity-50"
          >
            {regenerating ? "Retrying…" : "Retry"}
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-800 text-xs">
          {error}
        </div>
      )}

      {status === "ready" && task && (
        <div className="p-4 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#4B92DB] font-semibold">
              Theme
            </div>
            <div className="text-sm text-slate-700">{task.themeSummary}</div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Exhibit
              </div>
              <div className="font-medium text-[#1B2A4A]">{task.exhibitTitle}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Deliverable
              </div>
              <div className="font-medium text-[#1B2A4A]">
                {task.deliverableLabel}{" "}
                <span className="text-xs text-slate-500 font-normal">
                  · {task.totalMarks} marks
                </span>
              </div>
            </div>
          </div>

          <details>
            <summary className="cursor-pointer text-xs text-[#4B92DB] hover:underline">
              Brief preview
            </summary>
            <div className="mt-2 max-h-72 overflow-y-auto bg-slate-50 border border-slate-200 rounded p-3 text-xs whitespace-pre-wrap font-mono text-slate-700">
              {task.briefMarkdown}
            </div>
          </details>

          <details>
            <summary className="cursor-pointer text-xs text-[#4B92DB] hover:underline">
              Exhibit preview
            </summary>
            <div className="mt-2 border border-slate-200 rounded overflow-hidden">
              <iframe
                srcDoc={task.exhibitHtml}
                sandbox=""
                className="w-full h-80 border-0 bg-white"
                title={task.exhibitTitle}
              />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
