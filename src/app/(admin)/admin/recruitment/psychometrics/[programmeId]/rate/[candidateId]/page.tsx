"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";

interface RatingData {
  assignment: {
    id: string;
    status: "ASSIGNED" | "IN_PROGRESS" | "SUBMITTED";
    dueAt: string | null;
    submittedAt: string | null;
    programme: {
      id: string;
      name: string;
      scenarioId: string;
      assessmentVersion: { label: string; scenarioHash: string };
    };
  };
  candidate: {
    id: string;
    anonymousId: string;
    responses: Array<{ id: string; taskNumber: number; content: string; wordCount: number }>;
  };
  scenario: { title: string; positionTitle: string; assessmentMode: string };
  rubric: {
    total_marks: number;
    tasks: Record<string, {
      title: string;
      max_marks: number;
      categories: Record<string, {
        max: number;
        description?: string;
        indicators?: string[];
        rubric?: Record<string, string>;
        descriptors?: Record<string, string>;
      }>;
    }>;
  };
  criteria: Array<{
    id: string;
    code: string;
    name: string;
    taskMappings: Array<{ taskNumber: number; marks: number; expectedCandidateEvidence: string }>;
  }>;
  ratings: Array<{
    responseId: string;
    score: number;
    criterionScores: Record<string, number> | null;
    comments: string | null;
  }>;
  disclosure: string;
}

interface DraftRating {
  score: string;
  criterionScores: Record<string, string>;
  comments: string;
}

export default function IndependentRatingPage() {
  const params = useParams<{ programmeId: string; candidateId: string }>();
  const [data, setData] = useState<RatingData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftRating>>({});
  const [activeResponseId, setActiveResponseId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/admin/recruitment/psychometrics/${params.programmeId}/rate/${params.candidateId}`,
      { cache: "no-store" },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    const next = body as RatingData;
    setData(next);
    setActiveResponseId((current) => current ?? next.candidate.responses[0]?.id ?? null);
    setDrafts(Object.fromEntries(next.candidate.responses.map((candidateResponse) => {
      const saved = next.ratings.find((rating) => rating.responseId === candidateResponse.id);
      return [candidateResponse.id, {
        score: saved?.score != null ? String(saved.score) : "",
        criterionScores: Object.fromEntries(
          Object.entries(saved?.criterionScores ?? {}).map(([id, score]) => [id, String(score)]),
        ),
        comments: saved?.comments ?? "",
      }];
    })));
  }, [params.candidateId, params.programmeId]);

  useEffect(() => { void load().catch((cause) => setError((cause as Error).message)); }, [load]);
  const activeResponse = data?.candidate.responses.find((response) => response.id === activeResponseId) ?? null;
  const activeTask = activeResponse ? data?.rubric.tasks[String(activeResponse.taskNumber)] : null;
  const activeCriteria = useMemo(() => data?.criteria.flatMap((criterion) =>
    criterion.taskMappings
      .filter((mapping) => mapping.taskNumber === activeResponse?.taskNumber && mapping.marks > 0)
      .map((mapping) => ({ ...criterion, mapping })),
  ) ?? [], [activeResponse?.taskNumber, data?.criteria]);
  const locked = data?.assignment.status === "SUBMITTED";

  const updateDraft = (responseId: string, patch: Partial<DraftRating>) => {
    setDrafts((current) => ({ ...current, [responseId]: { ...current[responseId], ...patch } }));
  };

  const save = async (submit: boolean) => {
    if (!data) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const ratings = data.candidate.responses
        .filter((response) => drafts[response.id]?.score !== "")
        .map((response) => ({
          responseId: response.id,
          score: Number(drafts[response.id].score),
          criterionScores: Object.fromEntries(
            Object.entries(drafts[response.id].criterionScores)
              .filter(([, score]) => score !== "")
              .map(([id, score]) => [id, Number(score)]),
          ),
          comments: drafts[response.id].comments,
        }));
      const response = await fetch(
        `/api/admin/recruitment/psychometrics/${params.programmeId}/rate/${params.candidateId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ratings, submit }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not save rating.");
      setMessage(submit ? "Independent rating submitted and locked." : "Draft saved.");
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-uq-3">{error || "Loading independent rating…"}</div>;
  }

  const draft = activeResponse ? drafts[activeResponse.id] : null;
  return (
    <div className="mx-auto max-w-7xl px-6 py-8 animate-uq-rise">
      <Link
        href={`/admin/recruitment/scenarios/${data.assignment.programme.scenarioId}`}
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-uq-accent hover:underline"
      >
        ← Validation Programme
      </Link>
      <header className="mt-3 rounded-xl border border-uq bg-uq-elev1 p-5 shadow-uq-glass">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-uq-3">Independent study rating</div>
            <h1 className="mt-1 text-xl font-semibold text-uq">{data.candidate.anonymousId}</h1>
            <p className="mt-1 text-sm text-uq-2">{data.scenario.positionTitle} · {data.scenario.assessmentMode.replaceAll("_", " ")}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${locked ? "border-uq-accent text-uq-accent" : "border-uq text-uq-2"}`}>
            {data.assignment.status.replaceAll("_", " ")}
          </span>
        </div>
        <p className="mt-4 rounded-lg border border-uq-faint bg-uq-elev2 px-3 py-2 text-xs leading-relaxed text-uq-2">{data.disclosure}</p>
        <div className="mt-2 font-mono text-[10px] text-uq-3">Frozen version: {data.assignment.programme.assessmentVersion.label} · {data.assignment.programme.assessmentVersion.scenarioHash}</div>
      </header>

      {(error || message) && (
        <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${error ? "border-uq-danger-line bg-uq-danger-soft text-uq-danger-text" : "border-uq-accent bg-uq-accent-soft text-uq"}`}>
          {error || message}
        </div>
      )}

      <nav className="mt-5 flex flex-wrap gap-1 rounded-lg bg-uq-elev2 p-1">
        {data.candidate.responses.map((response) => (
          <button
            key={response.id}
            onClick={() => setActiveResponseId(response.id)}
            className={`rounded-md px-3 py-1.5 text-xs ${activeResponseId === response.id ? "bg-uq-elev1 text-uq shadow-uq-e1" : "text-uq-3 hover:text-uq"}`}
          >
            Task {response.taskNumber}
          </button>
        ))}
      </nav>

      {activeResponse && activeTask && draft && (
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
          <section className="min-w-0 rounded-xl border border-uq bg-uq-elev1 p-5 shadow-uq-glass">
            <div className="flex items-center justify-between gap-3 border-b border-uq-faint pb-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-uq-3">Candidate response · Task {activeResponse.taskNumber}</div>
                <h2 className="mt-1 font-semibold text-uq">{activeTask.title}</h2>
              </div>
              <span className="font-mono text-xs text-uq-3">{activeResponse.wordCount} words</span>
            </div>
            <article
              className="markdown-rendered mt-5 max-w-none text-sm leading-7 text-uq"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(activeResponse.content) }}
            />
          </section>

          <aside className="space-y-4">
            <section className="rounded-xl border border-uq bg-uq-elev1 p-4 shadow-uq-glass">
              <label className="text-sm font-medium text-uq">
                Independent score <span className="font-normal text-uq-3">/ {activeTask.max_marks}</span>
                <input
                  type="number"
                  min={0}
                  max={activeTask.max_marks}
                  step="0.5"
                  disabled={locked}
                  value={draft.score}
                  onChange={(event) => updateDraft(activeResponse.id, { score: event.target.value })}
                  className="mt-2 block w-full rounded-lg border border-uq bg-uq-elev2 px-3 py-2 font-mono text-uq focus:border-uq-accent focus:outline-none"
                />
              </label>
              {activeCriteria.length > 0 && (
                <div className="mt-4 space-y-3 border-t border-uq-faint pt-4">
                  {activeCriteria.map(({ id, code, name, mapping }) => (
                    <label key={id} className="block text-xs text-uq-2">
                      <span className="font-medium text-uq">{code} · {name}</span> / {mapping.marks}
                      <input
                        type="number"
                        min={0}
                        max={mapping.marks}
                        step="0.5"
                        disabled={locked}
                        value={draft.criterionScores[id] ?? ""}
                        onChange={(event) => updateDraft(activeResponse.id, {
                          criterionScores: { ...draft.criterionScores, [id]: event.target.value },
                        })}
                        className="mt-1 block w-full rounded-lg border border-uq bg-uq-elev2 px-3 py-2 font-mono text-uq focus:border-uq-accent focus:outline-none"
                      />
                      <span className="mt-1 block text-[11px] leading-relaxed text-uq-3">{mapping.expectedCandidateEvidence}</span>
                    </label>
                  ))}
                </div>
              )}
              <label className="mt-4 block text-xs font-medium text-uq-2">
                Rationale
                <textarea
                  rows={5}
                  disabled={locked}
                  value={draft.comments}
                  onChange={(event) => updateDraft(activeResponse.id, { comments: event.target.value })}
                  className="mt-1 block w-full rounded-lg border border-uq bg-uq-elev2 px-3 py-2 text-sm text-uq focus:border-uq-accent focus:outline-none"
                />
              </label>
            </section>

            <section className="rounded-xl border border-uq bg-uq-elev1 p-4 shadow-uq-glass">
              <h3 className="text-sm font-semibold text-uq">Frozen rubric</h3>
              <div className="mt-3 space-y-3">
                {Object.entries(activeTask.categories).map(([id, category]) => (
                  <div key={id} className="rounded-lg border border-uq-faint bg-uq-elev2 p-3 text-xs">
                    <div className="flex justify-between gap-2 font-medium text-uq"><span>{id.replaceAll("_", " ")}</span><span className="font-mono">{category.max}m</span></div>
                    {category.description && <p className="mt-1 leading-relaxed text-uq-2">{category.description}</p>}
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}

      {!locked && (
        <footer className="sticky bottom-4 mt-5 rounded-xl border border-uq bg-uq-elev1 p-4 shadow-uq-glass">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <label className="flex max-w-2xl items-start gap-2 text-xs leading-relaxed text-uq-2">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5" />
              I confirm this rating was completed independently. Submission locks every rating in this assignment and does not change the operational hiring score.
            </label>
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => void save(false)} className="rounded-lg border border-uq px-4 py-2 text-sm text-uq-2 hover:text-uq disabled:opacity-50">Save draft</button>
              <button disabled={busy || !confirmed} onClick={() => void save(true)} className="rounded-lg bg-uq-accent px-4 py-2 text-sm font-medium text-[color:var(--uq-text-on-accent)] disabled:opacity-50">Submit and lock</button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
