"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { consumeSseResultStream } from "@/lib/recruit/sse-client";

interface GeneratedTaskDraft {
  title: string;
  briefMarkdown: string;
  exhibitTitle: string;
  exhibitHtml: string;
  deliverableLabel: string;
  deliverablePlaceholder: string;
  totalMarks: number;
  themeSummary: string;
  // Per-task marking rubric (the `categories` object) authored by the
  // Lambda's second call; null when that call failed soft. Carried
  // opaquely through to the save POST — the wizard never renders it.
  rubric?: Record<string, unknown> | null;
}

type Step = "upload" | "criteria" | "configure" | "review";

// memo_ai is fixed at 2 tasks per assessment — the selected criteria
// are distributed across them. Cap at 6 ticked (3 per task) so an
// individual task isn't overloaded with too many competencies to
// test in a single coherent scenario.
const MEMO_AI_TASK_COUNT = 2;
const MAX_SELECTED_CRITERIA = 6;
const SOFT_WARN_AT = 5;
const DEFAULT_ORG = "International Digital Services Centre (IDSC), Geneva";

// sessionStorage key set by the WIPO picker page
// (/admin/recruitment/scenarios/new/from-wipo). When present on mount,
// we hydrate the form from a real WIPO posting and skip the upload
// step.
const WIPO_HANDOFF_STORAGE_KEY = "wipo-jd-handoff";

interface WipoHandoff {
  jdText: string;
  title: string;
  positionTitle: string;
  organisation: string;
  filename: string;
  sourceLink: string | null;
}

/**
 * Split a flat list of selected criteria into one bucket per
 * generated task. With memo_ai at 2 tasks: first half goes to task 1,
 * second half to task 2. If only 1 criterion is ticked, both tasks
 * test the same one — the priorThemes mechanism keeps the scenarios
 * distinct.
 */
function distributeCriteria(criteria: string[]): string[][] {
  if (criteria.length === 0) return [];
  if (criteria.length === 1) {
    return [[criteria[0]], [criteria[0]]];
  }
  const splitPoint = Math.ceil(criteria.length / 2);
  return [criteria.slice(0, splitPoint), criteria.slice(splitPoint)];
}

export default function GenerateFromJdPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();

  const [step, setStep] = useState<Step>("upload");

  // Upload step
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [jdText, setJdText] = useState("");
  const [filename, setFilename] = useState("");

  // Criteria step. essentialCriteria/desirableCriteria are the lists
  // returned by the extractor (mutable — HR can edit each one in
  // place). selectedCriteria is the set of criterion *texts* (not
  // indexes) that are ticked; using text as the key makes edits
  // safer (we update the Set entry alongside the text). When
  // usingManualCriteria is true, the user is in the empty-extraction
  // textarea fallback and the lists above are unused.
  const [extractingCriteria, setExtractingCriteria] = useState(false);
  const [criteriaError, setCriteriaError] = useState<string | null>(null);
  const [essentialCriteria, setEssentialCriteria] = useState<string[]>([]);
  const [desirableCriteria, setDesirableCriteria] = useState<string[]>([]);
  const [selectedCriteria, setSelectedCriteria] = useState<Set<string>>(
    new Set()
  );
  const [usingManualCriteria, setUsingManualCriteria] = useState(false);
  const [manualCriteriaText, setManualCriteriaText] = useState("");
  // Set true once extraction has been kicked off for the current JD,
  // to prevent the back-navigation re-extract loop.
  const [extractionStarted, setExtractionStarted] = useState(false);

  // Configure step
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [organisation, setOrganisation] = useState(DEFAULT_ORG);
  const [positionTitle, setPositionTitle] = useState("");
  const [defaultTotalMinutes, setDefaultTotalMinutes] = useState("90");
  // Set when this flow was started from a WIPO posting — used to show
  // a "Source: WIPO posting →" link on the configure step.
  const [sourceLink, setSourceLink] = useState<string | null>(null);

  // Guard so the WIPO hand-off effect runs at most once even under
  // React strict-mode double-invocation.
  const wipoHandoffConsumedRef = useRef(false);

  // Review step
  // taskCriteriaBuckets is the per-task list of criteria for each
  // generated slot. Set once in startGeneration; never mutated for
  // the lifetime of the review session. regenerateTask reads from it
  // so a regenerated task tests the same set of criteria as the
  // original.
  const [tasks, setTasks] = useState<(GeneratedTaskDraft | null)[]>([]);
  const [taskStatuses, setTaskStatuses] = useState<
    ("pending" | "generating" | "ready" | "error")[]
  >([]);
  const [taskErrors, setTaskErrors] = useState<(string | null)[]>([]);
  const [taskCriteriaBuckets, setTaskCriteriaBuckets] = useState<string[][]>(
    []
  );
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
    // Reset criteria state for a fresh upload — the new JD will need
    // its own extraction.
    setEssentialCriteria([]);
    setDesirableCriteria([]);
    setSelectedCriteria(new Set());
    setUsingManualCriteria(false);
    setManualCriteriaText("");
    setExtractionStarted(false);
    setCriteriaError(null);
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
      const suggested =
        typeof body.suggestedJobTitle === "string" && body.suggestedJobTitle
          ? body.suggestedJobTitle
          : null;
      if (suggested) {
        setTitle(suggested);
        setPositionTitle(suggested);
      }
      setStep("criteria");
      // Fire the criteria extraction now — the criteria step renders
      // its own loading state and waits for it.
      void runCriteriaExtraction(body.text, suggested ?? "");
    } catch (e) {
      setParseError((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const runCriteriaExtraction = async (
    text: string,
    extractTitle: string
  ) => {
    if (!text.trim()) return;
    setExtractionStarted(true);
    setExtractingCriteria(true);
    setCriteriaError(null);
    try {
      const res = await fetch(
        "/api/admin/recruitment/scenarios/from-jd/extract-criteria",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jdText: text,
            // Use whatever we have for position title — falls back to
            // the parsed title if state hasn't been set yet (race on
            // the first parse).
            positionTitle: positionTitle || extractTitle || "the role",
          }),
        }
      );
      const payload = await consumeSseResultStream<{
        essential: string[];
        desirable: string[];
      }>(res);
      const ess = Array.isArray(payload.essential) ? payload.essential : [];
      const des = Array.isArray(payload.desirable) ? payload.desirable : [];
      setEssentialCriteria(ess);
      setDesirableCriteria(des);
      // Empty extraction → drop into manual fallback so the user
      // isn't stuck on an empty step.
      if (ess.length === 0 && des.length === 0) {
        setUsingManualCriteria(true);
      }
    } catch (e) {
      setCriteriaError((e as Error).message);
    } finally {
      setExtractingCriteria(false);
    }
  };

  // WIPO hand-off: when the picker page navigates here after the user
  // chose a posting, it leaves a payload in sessionStorage. Hydrate the
  // form from it, skip the upload step, and fire criteria extraction
  // immediately — same flow as a successful PDF/DOCX upload, just with
  // a pre-fetched JD.
  useEffect(() => {
    if (wipoHandoffConsumedRef.current) return;
    if (typeof window === "undefined") return;
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(WIPO_HANDOFF_STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    wipoHandoffConsumedRef.current = true;
    try {
      window.sessionStorage.removeItem(WIPO_HANDOFF_STORAGE_KEY);
    } catch {
      // Storage may be locked down (incognito, quota); already consumed.
    }
    let payload: WipoHandoff;
    try {
      payload = JSON.parse(raw) as WipoHandoff;
    } catch {
      return;
    }
    if (!payload.jdText?.trim() || !payload.title?.trim()) return;

    setJdText(payload.jdText);
    setTitle(payload.title);
    setPositionTitle(payload.positionTitle || payload.title);
    setOrganisation(payload.organisation || "WIPO");
    setFilename(payload.filename || "WIPO posting");
    setSourceLink(payload.sourceLink || null);
    setStep("criteria");
    void runCriteriaExtraction(payload.jdText, payload.title);
    // Run only once on mount; the ref guards against double-invoke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click-to-edit on a criterion: replaces the text in its array AND
  // updates the selection set if that criterion was ticked.
  const updateCriterion = (
    list: "essential" | "desirable",
    oldText: string,
    newText: string
  ) => {
    const setter =
      list === "essential" ? setEssentialCriteria : setDesirableCriteria;
    setter((prev) =>
      prev.map((t) => (t === oldText ? newText : t))
    );
    setSelectedCriteria((prev) => {
      if (!prev.has(oldText)) return prev;
      const next = new Set(prev);
      next.delete(oldText);
      next.add(newText);
      return next;
    });
  };

  const toggleCriterion = (text: string) => {
    setSelectedCriteria((prev) => {
      const next = new Set(prev);
      if (next.has(text)) {
        next.delete(text);
      } else {
        if (next.size >= MAX_SELECTED_CRITERIA) return prev; // hard cap
        next.add(text);
      }
      return next;
    });
  };

  // Manual fallback: when extraction returns empty, the user types
  // criteria into a textarea (one per line). We treat each non-empty
  // line as a virtual criterion; selection is applied to ALL of
  // them up to the cap.
  const manualCriterionList = useMemo(() => {
    return manualCriteriaText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 15); // mirror extractor's per-list cap
  }, [manualCriteriaText]);

  // What lands in startGeneration as the ordered list of criteria.
  // Essential first, then desirable, in the order they were returned
  // (or typed in the manual fallback). Filtered by selection.
  const orderedSelectedCriteria = useMemo(() => {
    if (usingManualCriteria) {
      return manualCriterionList.filter((c) => selectedCriteria.has(c));
    }
    return [
      ...essentialCriteria.filter((c) => selectedCriteria.has(c)),
      ...desirableCriteria.filter((c) => selectedCriteria.has(c)),
    ];
  }, [
    usingManualCriteria,
    manualCriterionList,
    essentialCriteria,
    desirableCriteria,
    selectedCriteria,
  ]);

  // Always 2 tasks for memo_ai. The criteria ticked are distributed
  // across both — see `distributeCriteria` for the split logic.
  const selectedCount = orderedSelectedCriteria.length;
  const generatedTaskCount = selectedCount === 0 ? 0 : MEMO_AI_TASK_COUNT;

  const startGeneration = async () => {
    if (selectedCount === 0) return;
    const buckets = distributeCriteria(orderedSelectedCriteria);
    setStep("review");
    setTaskCriteriaBuckets(buckets);
    const initialTasks: (GeneratedTaskDraft | null)[] = Array.from(
      { length: buckets.length },
      () => null
    );
    const initialStatuses: ("pending" | "generating" | "ready" | "error")[] =
      Array.from({ length: buckets.length }, (_, i) =>
        i === 0 ? "generating" : "pending"
      );
    setTasks(initialTasks);
    setTaskStatuses(initialStatuses);
    setTaskErrors(Array.from({ length: buckets.length }, () => null));

    // Sequence-then-parallel: task 1 runs alone so the JD prefix is
    // cached before parallel calls fire (concurrent first calls would
    // each pay the cache-write premium; reads only become possible
    // after the first response begins streaming). Tasks 2..N then run
    // in parallel and read the cached prefix.
    let firstTask: GeneratedTaskDraft | null;
    try {
      firstTask = await generateOne({
        jdText,
        positionTitle,
        organisation,
        focusCriteria: buckets[0],
        taskIndex: 1,
        taskCount: buckets.length,
        priorThemes: [],
      });
      setTasks((prev) => withAt(prev, 0, firstTask!));
      setTaskStatuses((prev) => withAt(prev, 0, "ready"));
    } catch (e) {
      setTaskErrors((prev) => withAt(prev, 0, (e as Error).message));
      setTaskStatuses((prev) => withAt(prev, 0, "error"));
      // If task 1 failed, mark the rest pending → error.
      setTaskStatuses((prev) => prev.map((s, i) => (i > 0 ? "error" : s)));
      setTaskErrors((prev) =>
        prev.map((err, i) => (i > 0 ? "Task 1 failed; cannot continue." : err))
      );
      return;
    }

    if (buckets.length === 1) return;

    setTaskStatuses((prev) =>
      prev.map((s, i) => (i >= 1 ? "generating" : s))
    );

    await Promise.all(
      Array.from({ length: buckets.length - 1 }, (_, k) => {
        const idx = k + 1;
        return generateOne({
          jdText,
          positionTitle,
          organisation,
          focusCriteria: buckets[idx],
          taskIndex: idx + 1,
          taskCount: buckets.length,
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
    const focusCriteria = taskCriteriaBuckets[idx];
    if (!focusCriteria || focusCriteria.length === 0) return;
    setRegeneratingIndex(idx);
    setTaskErrors((prev) => withAt(prev, idx, null));
    setTaskStatuses((prev) => withAt(prev, idx, "generating"));
    try {
      const priorThemes = tasks
        .map((t, i) => (i !== idx && t ? t.themeSummary : null))
        .filter((s): s is string => Boolean(s));
      const fresh = await generateOne({
        jdText,
        positionTitle,
        organisation,
        focusCriteria,
        taskIndex: idx + 1,
        taskCount: taskCriteriaBuckets.length,
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
      taskStatuses.length > 0 && taskStatuses.every((s) => s === "ready"),
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
    <div className="max-w-4xl mx-auto px-6 py-8 animate-uq-rise">
      <div className="text-xs">
        <Link
          href="/admin/recruitment/scenarios"
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-uq-accent hover:text-uq-accent-hover hover:underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md"
        >
          ← Scenarios
        </Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-uq mt-2">
        Generate from job description
      </h1>
      <p className="text-sm text-uq-2 mt-1 mb-6">
        Upload a JD; pick the essential or desirable criteria you want to
        test; Claude generates one task per criterion, each with a brief, an
        industry-matched exhibit, and a deliverable.
      </p>

      <Stepper step={step} />

      {step === "upload" && (
        <UploadStep
          parsing={parsing}
          parseError={parseError}
          onFileSelected={onFileSelected}
        />
      )}

      {step === "criteria" && (
        <CriteriaStep
          extracting={extractingCriteria}
          extractionStarted={extractionStarted}
          error={criteriaError}
          essential={essentialCriteria}
          desirable={desirableCriteria}
          selected={selectedCriteria}
          onToggle={toggleCriterion}
          onEdit={updateCriterion}
          usingManual={usingManualCriteria}
          manualText={manualCriteriaText}
          setManualText={setManualCriteriaText}
          manualList={manualCriterionList}
          onRetry={() => void runCriteriaExtraction(jdText, positionTitle)}
          onSwitchToManual={() => setUsingManualCriteria(true)}
          selectedCount={selectedCount}
          generatedTaskCount={generatedTaskCount}
          onBack={() => setStep("upload")}
          onContinue={() => setStep("configure")}
        />
      )}

      {step === "configure" && (
        <ConfigureStep
          jdText={jdText}
          filename={filename}
          sourceLink={sourceLink}
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
          generatedTaskCount={generatedTaskCount}
          selectedCount={selectedCount}
          canSubmit={Boolean(canConfigure) && selectedCount > 0}
          onBack={() => setStep("criteria")}
          onSubmit={() => void startGeneration()}
        />
      )}

      {step === "review" && (
        <ReviewStep
          tasks={tasks}
          statuses={taskStatuses}
          errors={taskErrors}
          taskCriteriaBuckets={taskCriteriaBuckets}
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

/**
 * Kick off a generation job and poll until it completes. The SSR
 * route only enqueues the job (fast, well under any timeout); the
 * actual Anthropic call runs in a worker Lambda that writes the
 * result back to the DB. We poll the status endpoint every 2s.
 */
async function generateOne(input: {
  jdText: string;
  positionTitle: string;
  organisation: string;
  focusCriteria: string[];
  taskIndex: number;
  taskCount: number;
  priorThemes: string[];
}): Promise<GeneratedTaskDraft> {
  // Enqueue
  const enqueueRes = await fetch(
    "/api/admin/recruitment/scenarios/from-jd/generate-task",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  const enqueueBody = await enqueueRes.json().catch(() => ({}));
  if (!enqueueRes.ok || !enqueueBody.jobId) {
    throw new Error(enqueueBody.error || `HTTP ${enqueueRes.status}`);
  }
  const jobId: string = enqueueBody.jobId;

  // Poll. 2s interval, 5-min cap (matches Lambda timeout — past that
  // the job is dead anyway).
  const POLL_INTERVAL_MS = 2_000;
  const MAX_POLLS = (5 * 60_000) / POLL_INTERVAL_MS; // 150
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollRes = await fetch(
      `/api/admin/recruitment/scenarios/from-jd/generate-task/${jobId}`,
      { cache: "no-store" }
    );
    const pollBody = await pollRes.json().catch(() => ({}));
    if (!pollRes.ok) {
      throw new Error(pollBody.error || `HTTP ${pollRes.status}`);
    }
    if (pollBody.status === "completed" && pollBody.result?.task) {
      // result_json = { task, rubric, usage }. Fold the sibling rubric
      // onto the draft so it rides along in the save POST body. null when
      // the rubric call failed soft.
      return {
        ...(pollBody.result.task as GeneratedTaskDraft),
        rubric: pollBody.result.rubric ?? null,
      };
    }
    if (pollBody.status === "failed") {
      throw new Error(pollBody.error || "Generation failed");
    }
    // queued | running → keep polling.
  }
  throw new Error(
    "Generation did not complete within 5 minutes. Check the worker Lambda logs."
  );
}

/* ---------------- step components ---------------- */

function Stepper({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload JD" },
    { key: "criteria", label: "Pick criteria" },
    { key: "configure", label: "Configure" },
    { key: "review", label: "Review & save" },
  ];
  const activeIdx = items.findIndex((i) => i.key === step);
  return (
    <ol className="flex items-center gap-2 mb-6 text-xs text-uq-3 flex-wrap">
      {items.map((it, i) => (
        <li key={it.key} className="flex items-center gap-2">
          <span
            className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] font-semibold ${
              i < activeIdx
                ? "bg-uq-elev2 text-uq border border-uq-strong"
                : i === activeIdx
                ? "bg-uq-accent text-[color:var(--uq-text-on-accent)]"
                : "bg-uq-elev2 text-uq-3 border border-uq-faint"
            }`}
          >
            {i + 1}
          </span>
          <span
            className={i === activeIdx ? "font-semibold text-uq" : "text-uq-3"}
          >
            {it.label}
          </span>
          {i < items.length - 1 && (
            <span className="text-uq-3 mx-1">━</span>
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
    <section className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass p-6">
      <h2 className="text-base font-semibold text-uq">
        Upload the job description
      </h2>
      <p className="text-sm text-uq-2 mt-1">
        PDF or DOCX, up to 10MB. The text is extracted server-side and used
        to identify the role&apos;s essential and desirable criteria. The
        original file isn&apos;t stored — only the parsed text is saved with
        the scenario.
      </p>

      <label className="mt-5 block border-2 border-dashed border-uq-strong rounded-lg p-8 text-center cursor-pointer hover:border-uq-accent hover:bg-uq-elev2 transition">
        <div className="text-sm font-medium text-uq">
          {parsing ? "Parsing…" : "Choose a PDF or DOCX file"}
        </div>
        <div className="text-xs text-uq-3 mt-1">
          or drop one here (click to browse)
        </div>
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={parsing}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileSelected(f);
            e.target.value = "";
          }}
          className="hidden"
        />
      </label>

      {parseError && (
        <div className="mt-3 rounded-md px-3 py-2 text-sm border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">
          {parseError}
        </div>
      )}
    </section>
  );
}

function CriteriaStep({
  extracting,
  extractionStarted,
  error,
  essential,
  desirable,
  selected,
  onToggle,
  onEdit,
  usingManual,
  manualText,
  setManualText,
  manualList,
  onRetry,
  onSwitchToManual,
  selectedCount,
  generatedTaskCount,
  onBack,
  onContinue,
}: {
  extracting: boolean;
  extractionStarted: boolean;
  error: string | null;
  essential: string[];
  desirable: string[];
  selected: Set<string>;
  onToggle: (text: string) => void;
  onEdit: (
    list: "essential" | "desirable",
    oldText: string,
    newText: string
  ) => void;
  usingManual: boolean;
  manualText: string;
  setManualText: (v: string) => void;
  manualList: string[];
  onRetry: () => void;
  onSwitchToManual: () => void;
  selectedCount: number;
  generatedTaskCount: number;
  onBack: () => void;
  onContinue: () => void;
}) {
  const atCap = selected.size >= MAX_SELECTED_CRITERIA;
  const showWarn = selected.size >= SOFT_WARN_AT;
  const continueLabel =
    selectedCount === 0
      ? "Pick at least one criterion"
      : `Continue (${generatedTaskCount} task${generatedTaskCount === 1 ? "" : "s"} · ${selectedCount} criteri${selectedCount === 1 ? "on" : "a"})`;

  return (
    <section className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-uq">
          Pick the criteria to test
        </h2>
        <p className="text-sm text-uq-2 mt-1">
          Tick the essential or desirable criteria this assessment should
          probe. memo_ai assessments are always {MEMO_AI_TASK_COUNT} tasks —
          your ticked criteria are distributed across them, with each task
          designed as a single coherent scenario testing its share. Click
          any criterion to edit the text before generating.
        </p>
      </div>

      {extracting && (
        <div className="rounded-md border border-uq-faint bg-uq-glass-subtle px-4 py-6 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-uq-2">
            <span className="w-2 h-2 rounded-full bg-uq-accent animate-uq-pulse-glow" />
            Extracting essential and desirable criteria from the JD…
          </div>
        </div>
      )}

      {!extracting && error && (
        <div className="rounded-md border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] px-4 py-3 text-sm text-[color:var(--uq-danger-text)]">
          <div className="font-medium">Extraction failed</div>
          <div className="mt-1 text-xs">{error}</div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={onRetry}
              className="px-3 py-1.5 rounded-md border border-[color:var(--uq-danger-line)] text-xs font-medium text-[color:var(--uq-danger-text)] transition-colors hover:bg-[color:var(--uq-danger-soft)] focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            >
              Retry
            </button>
            <button
              onClick={onSwitchToManual}
              className="px-3 py-1.5 rounded-md border border-uq text-uq-2 text-xs font-medium transition-colors hover:border-uq-strong hover:bg-uq-elev2 hover:text-uq focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            >
              Type criteria manually
            </button>
          </div>
        </div>
      )}

      {!extracting && !error && extractionStarted && !usingManual && (
        <>
          <CriterionList
            kind="essential"
            label="Essential criteria"
            sublabel="Required experience or competencies."
            items={essential}
            selected={selected}
            atCap={atCap}
            onToggle={onToggle}
            onEdit={(oldText, newText) => onEdit("essential", oldText, newText)}
          />
          <CriterionList
            kind="desirable"
            label="Desirable criteria"
            sublabel="Nice-to-have experience or competencies. Optional."
            items={desirable}
            selected={selected}
            atCap={atCap}
            onToggle={onToggle}
            onEdit={(oldText, newText) => onEdit("desirable", oldText, newText)}
          />

          <div className="text-xs text-uq-3 italic">
            Don&apos;t see what you wanted to test?{" "}
            <button
              type="button"
              onClick={onSwitchToManual}
              className="text-uq-accent hover:text-uq-accent-hover hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md"
            >
              Type custom criteria instead
            </button>
            .
          </div>
        </>
      )}

      {!extracting && usingManual && (
        <ManualCriteriaEditor
          text={manualText}
          setText={setManualText}
          items={manualList}
          selected={selected}
          atCap={atCap}
          onToggle={onToggle}
        />
      )}

      <div className="flex items-center justify-between pt-2 border-t border-uq-faint">
        <div className="text-xs text-uq-2">
          <span
            className={`font-mono tabular-nums ${
              atCap ? "text-[color:var(--uq-warn-text)] font-semibold" : "text-uq"
            }`}
          >
            {selected.size} of {MAX_SELECTED_CRITERIA}
          </span>{" "}
          selected
          {selected.size > 0 && (
            <span className="ml-2 text-uq-3">
              · {Math.ceil(selected.size / MEMO_AI_TASK_COUNT)} criteri
              {Math.ceil(selected.size / MEMO_AI_TASK_COUNT) === 1 ? "on" : "a"}{" "}
              per task
            </span>
          )}
          {showWarn && !atCap && (
            <span className="ml-2 text-[color:var(--uq-warn-text)]">
              · packing many criteria into a single task can dilute focus
            </span>
          )}
          {atCap && (
            <span className="ml-2 text-[color:var(--uq-warn-text)]">
              · cap reached — untick to free a slot
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-sm text-uq-2 hover:text-uq transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md"
          >
            ← Back
          </button>
          <button
            onClick={onContinue}
            disabled={selectedCount === 0 || extracting}
            className="px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
          >
            {continueLabel}
          </button>
        </div>
      </div>
    </section>
  );
}

function CriterionList({
  kind,
  label,
  sublabel,
  items,
  selected,
  atCap,
  onToggle,
  onEdit,
}: {
  kind: "essential" | "desirable";
  label: string;
  sublabel: string;
  items: string[];
  selected: Set<string>;
  atCap: boolean;
  onToggle: (text: string) => void;
  onEdit: (oldText: string, newText: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-accent">
          {label}
        </div>
        <div className="text-xs text-uq-3 mt-1 italic">
          None identified in this JD.
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-accent">
        {label}
      </div>
      <div className="text-xs text-uq-3 mt-0.5 mb-2">{sublabel}</div>
      <ul className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
        {items.map((text) => (
          <CriterionRow
            key={`${kind}-${text}`}
            text={text}
            checked={selected.has(text)}
            atCap={atCap}
            onToggle={() => onToggle(text)}
            onEdit={(newText) => {
              if (newText && newText !== text) onEdit(text, newText);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function CriterionRow({
  text,
  checked,
  atCap,
  onToggle,
  onEdit,
}: {
  text: string;
  checked: boolean;
  atCap: boolean;
  onToggle: () => void;
  onEdit: (newText: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep draft in sync if external text changes (e.g. selection state).
  useEffect(() => {
    if (!editing) setDraft(text);
  }, [text, editing]);

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      taRef.current.setSelectionRange(
        taRef.current.value.length,
        taRef.current.value.length
      );
    }
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== text) onEdit(trimmed);
    else setDraft(text);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(text);
  };

  // Disable the checkbox if at cap AND not currently checked.
  const checkboxDisabled = !checked && atCap;

  return (
    <li className="group">
      <label className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-uq-elev2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          disabled={checkboxDisabled}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 rounded accent-[color:var(--uq-accent)] flex-shrink-0 disabled:opacity-40"
        />
        {editing ? (
          <div className="flex-1 flex flex-col gap-1.5">
            <textarea
              ref={taRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancel();
                }
              }}
              rows={Math.max(2, Math.min(6, Math.ceil(draft.length / 80)))}
              className="w-full rounded-md border border-uq-accent bg-uq-glass-subtle px-2 py-1 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
            />
            <div className="text-[10px] text-uq-3">
              Press Enter to save, Esc to cancel.
            </div>
          </div>
        ) : (
          <span
            className="flex-1 text-sm text-uq-2 leading-relaxed"
            onClick={(e) => {
              // Click on text (but not the checkbox) → enter edit mode.
              // We stopPropagation so the surrounding label doesn't
              // toggle the checkbox at the same time.
              const target = e.target as HTMLElement;
              if (target.tagName !== "INPUT") {
                e.preventDefault();
                e.stopPropagation();
                setEditing(true);
              }
            }}
          >
            {text}
            <span className="ml-1.5 text-[10px] text-uq-3 opacity-0 group-hover:opacity-100 transition">
              (click to edit)
            </span>
          </span>
        )}
      </label>
    </li>
  );
}

function ManualCriteriaEditor({
  text,
  setText,
  items,
  selected,
  atCap,
  onToggle,
}: {
  text: string;
  setText: (v: string) => void;
  items: string[];
  selected: Set<string>;
  atCap: boolean;
  onToggle: (text: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-accent">
          Type criteria manually
        </div>
        <div className="text-xs text-uq-3 mt-0.5">
          One criterion per line. Each one becomes a tickable option below.
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder={
            "Demonstrated experience triaging multi-stage SIEM alerts under operational pressure\nFamiliarity with NIST CSF and ISO 27001 control frameworks\nWritten communication clear enough for a CISO audience"
          }
          className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm font-mono text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
        />
      </div>
      {items.length > 0 && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">
            Tick which to test
          </div>
          <ul className="mt-2 space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {items.map((line) => {
              const checked = selected.has(line);
              return (
                <li key={line}>
                  <label className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-uq-elev2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && atCap}
                      onChange={() => onToggle(line)}
                      className="mt-0.5 h-4 w-4 rounded accent-[color:var(--uq-accent)] flex-shrink-0 disabled:opacity-40"
                    />
                    <span className="flex-1 text-sm text-uq-2 leading-relaxed">
                      {line}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function ConfigureStep({
  jdText,
  filename,
  sourceLink,
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
  generatedTaskCount,
  selectedCount,
  canSubmit,
  onBack,
  onSubmit,
}: {
  jdText: string;
  filename: string;
  sourceLink: string | null;
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
  generatedTaskCount: number;
  selectedCount: number;
  canSubmit: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const tokenEstimate = Math.round(jdText.length / 4);
  // Pickers (WIPO, ITU, …) all set filename to `<NAME> posting · <id>`
  // so we can show provenance generically. Anything else is a JD upload.
  const postingMatch = filename.match(/^([A-Z][A-Z0-9-]*)\s+posting\b/);
  const sourceLabel = postingMatch
    ? `Source job description (${postingMatch[1]})`
    : "Parsed JD";
  return (
    <section className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass p-6 space-y-5">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-accent">
          {sourceLabel}
        </div>
        <div className="text-sm text-uq-2">
          <span className="font-mono">{filename}</span> ·{" "}
          {jdText.length.toLocaleString()} characters (~
          {tokenEstimate.toLocaleString()} tokens)
          {sourceLink && (
            <>
              {" · "}
              <a
                href={sourceLink.replace(/^http:\/\//i, "https://")}
                target="_blank"
                rel="noopener noreferrer"
                className="text-uq-accent hover:text-uq-accent-hover hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md"
              >
                ↗ original posting
              </a>
            </>
          )}
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-uq-accent hover:text-uq-accent-hover hover:underline">
            Preview text
          </summary>
          <pre className="mt-2 max-h-64 overflow-y-auto bg-uq-glass-subtle border border-uq-faint rounded p-3 text-xs whitespace-pre-wrap font-mono text-uq-2">
            {jdText.slice(0, 4000)}
            {jdText.length > 4000 && "\n\n…[truncated for preview]"}
          </pre>
        </details>
      </div>

      <hr className="border-uq-faint" />

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm sm:col-span-2">
          <span className="text-uq-2">Scenario title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Cybersecurity Officer (P3) — Technical Assessment"
            className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-uq-2">URL slug</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="cyber-officer-p3-2026"
            className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm font-mono text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
          />
          <span className="text-xs text-uq-3 mt-1 block">
            Candidate URL will be{" "}
            <code className="font-mono bg-uq-glass-subtle border border-uq-faint text-uq-cyan px-1.5 rounded">
              /assess/{slug || "..."}
            </code>
          </span>
        </label>
        <label className="block text-sm">
          <span className="text-uq-2">Organisation</span>
          <input
            value={organisation}
            onChange={(e) => setOrganisation(e.target.value)}
            placeholder="International Digital Services Centre (IDSC), Geneva"
            className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
          />
        </label>
        <label className="block text-sm">
          <span className="text-uq-2">Position title</span>
          <input
            value={positionTitle}
            onChange={(e) => setPositionTitle(e.target.value)}
            placeholder="Cybersecurity Officer (P3)"
            className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
          />
        </label>
        <label className="block text-sm">
          <span className="text-uq-2">Default total minutes</span>
          <input
            type="number"
            value={defaultTotalMinutes}
            onChange={(e) => setDefaultTotalMinutes(e.target.value)}
            min={5}
            max={480}
            className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
          />
        </label>
        <div className="block text-sm">
          <span className="text-uq-2">Tasks to generate</span>
          <div className="mt-1 px-3 py-2 text-sm bg-uq-glass-subtle border border-uq-faint rounded-md text-uq-2">
            <span className="font-mono tabular-nums text-uq">{generatedTaskCount}</span> task
            {generatedTaskCount === 1 ? "" : "s"} ·{" "}
            {selectedCount === 1
              ? "1 criterion split across both"
              : `${selectedCount} criteria distributed across them`}
          </div>
          <span className="text-xs text-uq-3 mt-1 block">
            Add other task kinds (email inbox, chat) afterwards in the
            standard editor.
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="text-sm text-uq-2 hover:text-uq transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md"
        >
          ← Back
        </button>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
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
  taskCriteriaBuckets,
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
  taskCriteriaBuckets: string[][];
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
        <h2 className="text-base font-semibold text-uq">
          Generated tasks
        </h2>
        <div className="font-mono text-xs text-uq-3 tabular-nums">
          {statuses.filter((s) => s === "ready").length} of {statuses.length}{" "}
          ready
        </div>
      </div>

      {tasks.map((t, i) => (
        <TaskCard
          key={i}
          index={i}
          task={t}
          focusCriteria={taskCriteriaBuckets[i] ?? []}
          status={statuses[i]}
          error={errors[i]}
          regenerating={regeneratingIndex === i}
          onRegenerate={() => onRegenerate(i)}
        />
      ))}

      {saveError && (
        <div className="rounded-md px-3 py-2 text-sm border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">
          {saveError}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          disabled={anyGenerating || saving}
          className="text-sm text-uq-2 hover:text-uq transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md"
        >
          ← Back
        </button>
        <button
          onClick={onSave}
          disabled={!allReady || saving}
          className="px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
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
  focusCriteria,
  status,
  error,
  regenerating,
  onRegenerate,
}: {
  index: number;
  task: GeneratedTaskDraft | null;
  focusCriteria: string[];
  status: "pending" | "generating" | "ready" | "error";
  error: string | null;
  regenerating: boolean;
  onRegenerate: () => void;
}) {
  return (
    <div className="rounded-xl border border-uq bg-uq-glass backdrop-blur-xl shadow-uq-glass overflow-hidden">
      <div className="px-4 py-3 border-b border-uq-faint bg-uq-glass-subtle flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-xs bg-uq-elev2 border border-uq-faint text-uq-2 rounded px-2 py-0.5">
            Task {index + 1}
          </span>
          {status === "ready" && task && (
            <span className="text-sm font-semibold text-uq truncate">
              {task.title}
            </span>
          )}
          {status === "pending" && (
            <span className="text-xs text-uq-3 italic">Queued…</span>
          )}
          {status === "generating" && (
            <span className="text-xs text-uq-accent italic flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-uq-accent animate-uq-pulse-glow" />
              Generating…
            </span>
          )}
          {status === "error" && (
            <span className="text-xs text-[color:var(--uq-danger-text)] italic">Failed</span>
          )}
        </div>
        {status === "ready" && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="px-3 py-1.5 rounded-md border border-uq text-uq-2 text-xs font-medium transition-colors hover:border-uq-strong hover:bg-uq-elev2 hover:text-uq disabled:opacity-50 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            title="Discard this draft and generate a new one for the same criterion"
          >
            {regenerating ? "Regenerating…" : "↻ Regenerate"}
          </button>
        )}
        {status === "error" && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="px-3 py-1.5 rounded-md border border-[color:var(--uq-danger-line)] text-[color:var(--uq-danger-text)] text-xs font-medium transition-colors hover:bg-[color:var(--uq-danger-soft)] disabled:opacity-50 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
          >
            {regenerating ? "Retrying…" : "Retry"}
          </button>
        )}
      </div>

      {focusCriteria.length > 0 && (
        <div className="px-4 py-2 bg-uq-accent-soft border-b border-uq-faint text-xs">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-accent">
            Testing {focusCriteria.length === 1 ? "criterion" : `${focusCriteria.length} criteria together`}
          </div>
          <ul className="mt-1 space-y-0.5">
            {focusCriteria.map((c) => (
              <li key={c} className="text-uq-2 leading-snug">
                · {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-[color:var(--uq-danger-soft)] border-b border-[color:var(--uq-danger-line)] text-[color:var(--uq-danger-text)] text-xs">
          {error}
        </div>
      )}

      {status === "ready" && task && (
        <div className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">
                Exhibit
              </div>
              <div className="font-medium text-uq">
                {task.exhibitTitle}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">
                Deliverable
              </div>
              <div className="font-medium text-uq">
                {task.deliverableLabel}{" "}
                <span className="text-xs text-uq-3 font-normal">
                  · {task.totalMarks} marks
                </span>
              </div>
            </div>
          </div>

          <details>
            <summary className="cursor-pointer text-xs text-uq-accent hover:text-uq-accent-hover hover:underline">
              Brief preview
            </summary>
            <div className="mt-2 max-h-72 overflow-y-auto bg-uq-glass-subtle border border-uq-faint rounded p-3 text-xs whitespace-pre-wrap font-mono text-uq-2">
              {task.briefMarkdown}
            </div>
          </details>

          <details>
            <summary className="cursor-pointer text-xs text-uq-accent hover:text-uq-accent-hover hover:underline">
              Exhibit preview
            </summary>
            {/* Scenario-authored HTML (untrusted) — keep a light plate per HARD RULE #4 */}
            <div className="mt-2 border border-uq rounded overflow-hidden">
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
