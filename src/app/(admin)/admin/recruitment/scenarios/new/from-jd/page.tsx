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
}

type Step = "upload" | "criteria" | "configure" | "review";

const MAX_SELECTED_CRITERIA = 5;
const SOFT_WARN_AT = 4;
const DEFAULT_ORG = "International Digital Services Centre (IDSC), Geneva";

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

  // Review step
  // taskCriteria is the ordered list of criteria that drove the
  // current task slots. Set once in startGeneration; never mutated
  // for the lifetime of the review session. regenerateTask reads
  // from it so a regenerated task tests the same criterion as the
  // original.
  const [tasks, setTasks] = useState<(GeneratedTaskDraft | null)[]>([]);
  const [taskStatuses, setTaskStatuses] = useState<
    ("pending" | "generating" | "ready" | "error")[]
  >([]);
  const [taskErrors, setTaskErrors] = useState<(string | null)[]>([]);
  const [taskCriteria, setTaskCriteria] = useState<string[]>([]);
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

  const taskCount = orderedSelectedCriteria.length;

  const startGeneration = async () => {
    if (taskCount === 0) return;
    const criteria = orderedSelectedCriteria;
    setStep("review");
    setTaskCriteria(criteria);
    const initialTasks: (GeneratedTaskDraft | null)[] = Array.from(
      { length: criteria.length },
      () => null
    );
    const initialStatuses: ("pending" | "generating" | "ready" | "error")[] =
      Array.from({ length: criteria.length }, (_, i) =>
        i === 0 ? "generating" : "pending"
      );
    setTasks(initialTasks);
    setTaskStatuses(initialStatuses);
    setTaskErrors(Array.from({ length: criteria.length }, () => null));

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
        focusCriterion: criteria[0],
        taskIndex: 1,
        taskCount: criteria.length,
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

    if (criteria.length === 1) return;

    setTaskStatuses((prev) =>
      prev.map((s, i) => (i >= 1 ? "generating" : s))
    );

    await Promise.all(
      Array.from({ length: criteria.length - 1 }, (_, k) => {
        const idx = k + 1;
        return generateOne({
          jdText,
          positionTitle,
          organisation,
          focusCriterion: criteria[idx],
          taskIndex: idx + 1,
          taskCount: criteria.length,
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
    const focusCriterion = taskCriteria[idx];
    if (!focusCriterion) return;
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
        focusCriterion,
        taskIndex: idx + 1,
        taskCount: taskCriteria.length,
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
          taskCount={taskCount}
          onBack={() => setStep("upload")}
          onContinue={() => setStep("configure")}
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
          canSubmit={Boolean(canConfigure) && taskCount > 0}
          onBack={() => setStep("criteria")}
          onSubmit={() => void startGeneration()}
        />
      )}

      {step === "review" && (
        <ReviewStep
          tasks={tasks}
          statuses={taskStatuses}
          errors={taskErrors}
          taskCriteria={taskCriteria}
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
  focusCriterion: string;
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
  const payload = await consumeSseResultStream<{ task: GeneratedTaskDraft }>(
    res
  );
  if (!payload.task) {
    throw new Error("Server response did not include a task.");
  }
  return payload.task;
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
    <ol className="flex items-center gap-2 mb-6 text-xs text-slate-600 flex-wrap">
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
            className={i === activeIdx ? "font-semibold text-[#1B2A4A]" : ""}
          >
            {it.label}
          </span>
          {i < items.length - 1 && (
            <span className="text-slate-300 mx-1">━</span>
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
        PDF or DOCX, up to 10MB. The text is extracted server-side and used
        to identify the role&apos;s essential and desirable criteria. The
        original file isn&apos;t stored — only the parsed text is saved with
        the scenario.
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
  taskCount,
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
  taskCount: number;
  onBack: () => void;
  onContinue: () => void;
}) {
  const atCap = selected.size >= MAX_SELECTED_CRITERIA;
  const showWarn = selected.size >= SOFT_WARN_AT;
  const continueLabel =
    taskCount === 0
      ? "Pick at least one criterion"
      : `Continue (${taskCount} task${taskCount === 1 ? "" : "s"})`;

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-[#1B2A4A]">
          Pick the criteria to test
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Tick the essential or desirable criteria you want this assessment
          to probe. One task is generated per ticked criterion, anchored on
          its specific wording. Click any criterion to edit the text before
          generating.
        </p>
      </div>

      {extracting && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-slate-700">
            <span className="w-2 h-2 rounded-full bg-[#4B92DB] animate-pulse" />
            Extracting essential and desirable criteria from the JD…
          </div>
        </div>
      )}

      {!extracting && error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="font-medium">Extraction failed</div>
          <div className="mt-1 text-xs">{error}</div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={onRetry}
              className="text-xs px-2.5 py-1 rounded border border-red-300 hover:bg-white text-red-700"
            >
              Retry
            </button>
            <button
              onClick={onSwitchToManual}
              className="text-xs px-2.5 py-1 rounded border border-slate-300 hover:bg-white text-slate-700"
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

          <div className="text-xs text-slate-500 italic">
            Don&apos;t see what you wanted to test?{" "}
            <button
              type="button"
              onClick={onSwitchToManual}
              className="text-[#4B92DB] hover:underline"
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

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <div className="text-xs text-slate-600">
          <span
            className={`font-mono ${
              atCap ? "text-amber-700 font-semibold" : ""
            }`}
          >
            {selected.size} of {MAX_SELECTED_CRITERIA}
          </span>{" "}
          selected
          {showWarn && !atCap && (
            <span className="ml-2 text-amber-700">
              · 4+ tasks may take 60–90s to generate
            </span>
          )}
          {atCap && (
            <span className="ml-2 text-amber-700">
              · cap reached — untick to free a slot
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Back
          </button>
          <button
            onClick={onContinue}
            disabled={taskCount === 0 || extracting}
            className="px-4 py-2 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338] disabled:bg-slate-300"
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
        <div className="text-[10px] uppercase tracking-wider text-[#4B92DB] font-semibold">
          {label}
        </div>
        <div className="text-xs text-slate-500 mt-1 italic">
          None identified in this JD.
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4B92DB] font-semibold">
        {label}
      </div>
      <div className="text-xs text-slate-500 mt-0.5 mb-2">{sublabel}</div>
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
      <label className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          disabled={checkboxDisabled}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1B2A4A] focus:ring-[#4B92DB] flex-shrink-0 disabled:opacity-40"
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
              className="text-sm border border-[#4B92DB] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#4B92DB]"
            />
            <div className="text-[10px] text-slate-500">
              Press Enter to save, Esc to cancel.
            </div>
          </div>
        ) : (
          <span
            className="flex-1 text-sm text-slate-700 leading-relaxed"
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
            <span className="ml-1.5 text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition">
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
        <div className="text-[10px] uppercase tracking-wider text-[#4B92DB] font-semibold">
          Type criteria manually
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          One criterion per line. Each one becomes a tickable option below.
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder={
            "Demonstrated experience triaging multi-stage SIEM alerts under operational pressure\nFamiliarity with NIST CSF and ISO 27001 control frameworks\nWritten communication clear enough for a CISO audience"
          }
          className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
        />
      </div>
      {items.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            Tick which to test
          </div>
          <ul className="mt-2 space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {items.map((line) => {
              const checked = selected.has(line);
              return (
                <li key={line}>
                  <label className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && atCap}
                      onChange={() => onToggle(line)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1B2A4A] focus:ring-[#4B92DB] flex-shrink-0 disabled:opacity-40"
                    />
                    <span className="flex-1 text-sm text-slate-700 leading-relaxed">
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
  canSubmit: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const tokenEstimate = Math.round(jdText.length / 4);
  return (
    <section className="bg-white rounded-lg border border-slate-200 p-6 space-y-5">
      <div>
        <div className="text-xs uppercase tracking-wider text-[#4B92DB] font-semibold">
          Parsed JD
        </div>
        <div className="text-sm text-slate-600">
          <span className="font-mono">{filename}</span> ·{" "}
          {jdText.length.toLocaleString()} characters (~
          {tokenEstimate.toLocaleString()} tokens)
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
        <div className="block text-sm">
          <span className="text-slate-600">Tasks to generate</span>
          <div className="mt-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-700">
            <span className="font-mono">{taskCount}</span> task
            {taskCount === 1 ? "" : "s"} · one per criterion you ticked
          </div>
          <span className="text-xs text-slate-500 mt-1 block">
            Add other task kinds (email inbox, chat) afterwards in the
            standard editor.
          </span>
        </div>
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
  taskCriteria,
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
  taskCriteria: string[];
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
          {statuses.filter((s) => s === "ready").length} of {statuses.length}{" "}
          ready
        </div>
      </div>

      {tasks.map((t, i) => (
        <TaskCard
          key={i}
          index={i}
          task={t}
          focusCriterion={taskCriteria[i] ?? null}
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
  focusCriterion,
  status,
  error,
  regenerating,
  onRegenerate,
}: {
  index: number;
  task: GeneratedTaskDraft | null;
  focusCriterion: string | null;
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
            title="Discard this draft and generate a new one for the same criterion"
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

      {focusCriterion && (
        <div className="px-4 py-2 bg-[#f5f8fb] border-b border-slate-200 text-xs">
          <span className="text-[10px] uppercase tracking-wider text-[#4B92DB] font-semibold">
            Testing
          </span>
          <span className="ml-2 text-slate-700">{focusCriterion}</span>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-800 text-xs">
          {error}
        </div>
      )}

      {status === "ready" && task && (
        <div className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Exhibit
              </div>
              <div className="font-medium text-[#1B2A4A]">
                {task.exhibitTitle}
              </div>
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
