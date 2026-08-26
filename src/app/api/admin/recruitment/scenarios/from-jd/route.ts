import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireScenarioBuilder } from "@/lib/admin-auth";
import { ASSESSMENT_MODE_POLICY_VERSION, defaultDefenceEnabled, isAssessmentMode } from "@/lib/recruit/assessment-modes";
import { makeSourceId } from "@/lib/recruit/source-verification";
import {
  ROLE_EVIDENCE_DISCLAIMER,
  ROLE_EVIDENCE_REVIEW_VERSION,
  normaliseRoleEvidenceReview,
  normaliseRoleEvidenceSourceKind,
  roleEvidenceReadiness,
  roleEvidenceWarnings,
  type RoleEvidenceReview,
} from "@/lib/recruit/role-evidence";

export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(["fam-p4", "aplo-p2"]);

interface IncomingTaskDraft {
  title: unknown;
  briefMarkdown: unknown;
  exhibitTitle: unknown;
  exhibitHtml: unknown;
  deliverableLabel: unknown;
  deliverablePlaceholder: unknown;
  totalMarks: unknown;
  rubric: unknown;
}

/**
 * POST /api/admin/recruitment/scenarios/from-jd
 *   body: {
 *     title, slug, organisation, positionTitle, defaultTotalMinutes,
 *     jdText, tasks: [{title, briefMarkdown, exhibitTitle, exhibitHtml,
 *                      deliverableLabel, deliverablePlaceholder, totalMarks}]
 *   }
 *   → { scenario: { id, slug, ... } }
 *
 * Persists an AI-generated scenario as a draft. Each task gets its own
 * exhibit row — the brief and the exhibit were generated together so the
 * 1:1 mapping is correct. Wrapped in a transaction so a partial failure
 * doesn't leave a header without children. After this returns, the client
 * redirects to the standard scenario editor for tweaks.
 */
export async function POST(request: NextRequest) {
  const auth = await requireScenarioBuilder();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));

  const title = String(body.title ?? "").trim();
  const slug = String(body.slug ?? "").trim().toLowerCase();
  const organisation = String(body.organisation ?? "").trim();
  const positionTitle = String(body.positionTitle ?? "").trim();
  const defaultTotalMinutes = Number(body.defaultTotalMinutes ?? 90);
  const jdText = String(body.jdText ?? "").trim();
  const tasksInput = Array.isArray(body.tasks) ? body.tasks : [];
  const assessmentMode = isAssessmentMode(body.assessmentMode) ? body.assessmentMode : "EVIDENCE";
  const defenceEnabled = body.defenceEnabled === undefined ? defaultDefenceEnabled(assessmentMode) : Boolean(body.defenceEnabled);
  const rawCriteria: unknown[] = Array.isArray(body.criteria) ? body.criteria : [];
  const criteriaInput: RoleEvidenceReview[] = rawCriteria
    .map(normaliseRoleEvidenceReview)
    .filter((value): value is RoleEvidenceReview => value !== null);
  const criteriaByTask = Array.isArray(body.criteriaByTask) ? body.criteriaByTask : [];
  const roleEvidenceSource = body.roleEvidenceSource && typeof body.roleEvidenceSource === "object"
    ? body.roleEvidenceSource as Record<string, unknown>
    : {};
  const sourceKind = normaliseRoleEvidenceSourceKind(roleEvidenceSource.sourceKind);
  const sourceLabel = String(roleEvidenceSource.sourceLabel ?? "Job description").trim().slice(0, 500) || "Job description";
  const sourceLink = String(roleEvidenceSource.sourceLink ?? "").trim().slice(0, 2_000) || null;

  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "slug must be lowercase letters, numbers and single hyphens" },
      { status: 400 }
    );
  }
  if (!organisation) {
    return NextResponse.json({ error: "organisation required" }, { status: 400 });
  }
  if (!positionTitle) {
    return NextResponse.json({ error: "positionTitle required" }, { status: 400 });
  }
  if (
    !Number.isFinite(defaultTotalMinutes) ||
    defaultTotalMinutes < 5 ||
    defaultTotalMinutes > 480
  ) {
    return NextResponse.json(
      { error: "defaultTotalMinutes must be between 5 and 480" },
      { status: 400 }
    );
  }
  if (!jdText) {
    return NextResponse.json({ error: "jdText required" }, { status: 400 });
  }
  if (tasksInput.length < 1 || tasksInput.length > 5) {
    return NextResponse.json(
      { error: "must include 1–5 tasks" },
      { status: 400 }
    );
  }
  if (rawCriteria.length < 1 || rawCriteria.length > 6 || criteriaInput.length !== rawCriteria.length) {
    return NextResponse.json(
      { error: "criteria must contain 1–6 complete Role Evidence Review records" },
      { status: 400 },
    );
  }
  const roleEvidenceReadinessResult = roleEvidenceReadiness(criteriaInput);
  if (!roleEvidenceReadinessResult.ready) {
    return NextResponse.json(
      { error: roleEvidenceReadinessResult.blockers[0] || "Role Evidence Review is incomplete" },
      { status: 400 },
    );
  }
  const retainedCriteria = criteriaInput.filter((criterion) => criterion.decision === "KEEP");

  // Validate every task before any DB write.
  const tasks: Array<{
    title: string;
    briefMarkdown: string;
    exhibitTitle: string;
    exhibitHtml: string;
    deliverableLabel: string;
    deliverablePlaceholder: string;
    totalMarks: number;
    rubric: object | null;
  }> = [];
  for (let i = 0; i < tasksInput.length; i++) {
    const t = tasksInput[i] as IncomingTaskDraft;
    const taskTitle = String(t.title ?? "").trim();
    const briefMarkdown = String(t.briefMarkdown ?? "").trim();
    const exhibitTitle = String(t.exhibitTitle ?? "").trim();
    const exhibitHtml = String(t.exhibitHtml ?? "").trim();
    const deliverableLabel = String(t.deliverableLabel ?? "").trim();
    const deliverablePlaceholder = String(t.deliverablePlaceholder ?? "").trim();
    const totalMarks = Number(t.totalMarks);
    if (
      !taskTitle ||
      !briefMarkdown ||
      !exhibitTitle ||
      !exhibitHtml ||
      !deliverableLabel ||
      !deliverablePlaceholder
    ) {
      return NextResponse.json(
        { error: `Task ${i + 1}: missing required field` },
        { status: 400 }
      );
    }
    if (!Number.isFinite(totalMarks) || totalMarks < 0 || totalMarks > 1000) {
      return NextResponse.json(
        { error: `Task ${i + 1}: totalMarks must be 0–1000` },
        { status: 400 }
      );
    }

    // Rubric is the per-task `categories` object authored by the Lambda
    // (or null when its call failed soft). Accept object-or-null; NEVER
    // hard-reject — a usable rubric should not be discarded over a maths
    // quibble. If the category maxes don't sum to totalMarks, just log:
    // the marking screen caps scores at the task max regardless.
    const rubric =
      t.rubric && typeof t.rubric === "object" && !Array.isArray(t.rubric)
        ? (t.rubric as Record<string, { max?: unknown }>)
        : null;
    if (rubric) {
      const sum = Object.values(rubric).reduce(
        (s, cat) => s + (typeof cat?.max === "number" ? cat.max : 0),
        0
      );
      if (sum !== totalMarks) {
        console.warn(
          `[from-jd] Task ${i + 1} rubric category maxes sum to ${sum}, expected ${totalMarks} (saving anyway)`
        );
      }
    }

    tasks.push({
      title: taskTitle,
      briefMarkdown,
      exhibitTitle,
      exhibitHtml,
      deliverableLabel,
      deliverablePlaceholder,
      totalMarks,
      rubric,
    });
  }

  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.json(
      { error: "slug is reserved by a built-in scenario" },
      { status: 409 }
    );
  }
  // The slug arrives auto-derived from the JD title. If a previous run
  // already saved a scenario with the same title (re-tests of the same
  // WIPO posting are common during demos), disambiguate by appending
  // `-2`, `-3`, ... rather than failing the save and forcing the user
  // back to edit the slug field.
  const finalSlug = await ensureUniqueSlug(slug);
  const reviewedAt = new Date();
  const reviewerName = String(auth.session.user.name || auth.session.user.email || "Current reviewer").slice(0, 500);
  const roleEvidenceRecord = {
    version: ROLE_EVIDENCE_REVIEW_VERSION,
    sourceKind,
    sourceLabel,
    sourceLink,
    assessmentMode,
    disclaimer: ROLE_EVIDENCE_DISCLAIMER,
    reviewedAt: reviewedAt.toISOString(),
    reviewedBy: { id: auth.userId, name: reviewerName },
    criteria: criteriaInput,
    warnings: criteriaInput.flatMap((criterion) => roleEvidenceWarnings(criterion, assessmentMode).map((warning) => ({
      reviewId: criterion.reviewId,
      criterion: criterion.criterion,
      ...warning,
    }))),
  };

  // One transaction: scenario header, exhibits, tasks (each linked to its
  // exhibit by id). If anything fails, the whole thing rolls back.
  const created = await prisma.$transaction(async (tx) => {
    const scenario = await tx.recruitmentScenario.create({
      data: {
        title,
        slug: finalSlug,
        organisation,
        positionTitle,
        defaultTotalMinutes,
        jdSourceText: jdText,
        roleEvidenceRecord: roleEvidenceRecord as unknown as Prisma.InputJsonValue,
        roleEvidenceReviewedById: auth.userId,
        roleEvidenceReviewedAt: reviewedAt,
        assessmentMode,
        modePolicyVersion: ASSESSMENT_MODE_POLICY_VERSION,
        defenceEnabled,
        defenceQuestionCount: 2,
        defenceMinutes: 5,
        createdById: auth.session.user.id,
      },
    });

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const exhibit = await tx.recruitmentScenarioExhibit.create({
        data: {
          scenarioId: scenario.id,
          title: t.exhibitTitle,
          html: t.exhibitHtml,
          sourceId: makeSourceId(t.exhibitTitle, i + 1),
        },
      });
      await tx.recruitmentScenarioTask.create({
        data: {
          scenarioId: scenario.id,
          number: i + 1,
          kind: "memo_ai",
          title: t.title,
          briefMarkdown: t.briefMarkdown,
          totalMarks: t.totalMarks,
          // Default IDSC-style system prompt for memo_ai. Admin can edit
          // this in the standard editor once the scenario is created.
          systemPrompt: defaultMemoSystemPrompt(positionTitle, organisation),
          exhibitId: exhibit.id,
          deliverableLabel: t.deliverableLabel,
          deliverablePlaceholder: t.deliverablePlaceholder,
          // Json? column; pass undefined (not null) when absent so the
          // column is left SQL NULL. Cast mirrors the issuesIdentified
          // write in the marking route.
          rubric: (t.rubric ?? undefined) as unknown as object | undefined,
        },
      });
    }

    // Persist extracted requirements as stable criteria. The generation
    // wizard supplies its per-task buckets so the initial blueprint is useful
    // immediately rather than leaving criteria transient in browser state.
    for (let criterionIndex = 0; criterionIndex < retainedCriteria.length; criterionIndex++) {
      const roleEvidence = retainedCriteria[criterionIndex];
      const criterionText = roleEvidence.criterion;
      const criterion = await tx.recruitmentScenarioCriterion.create({
        data: {
          scenarioId: scenario.id,
          code: `CRIT-${String(criterionIndex + 1).padStart(2, "0")}`,
          name: criterionText.slice(0, 160),
          description: criterionText,
          sourceRequirement: roleEvidence.sourceRequirement,
          observableBehaviours: roleEvidence.observableBehaviours,
          roleEvidence: roleEvidence as unknown as Prisma.InputJsonValue,
          order: criterionIndex,
        },
      });
      for (let taskIndex = 0; taskIndex < criteriaByTask.length; taskIndex++) {
        const bucket = Array.isArray(criteriaByTask[taskIndex]) ? criteriaByTask[taskIndex].map(String) : [];
        if (!bucket.includes(criterionText)) continue;
        const task = await tx.recruitmentScenarioTask.findUnique({
          where: { scenarioId_number: { scenarioId: scenario.id, number: taskIndex + 1 } },
          select: { id: true, rubric: true, totalMarks: true },
        });
        if (!task) continue;
        const rubric = task.rubric && typeof task.rubric === "object" && !Array.isArray(task.rubric)
          ? task.rubric as Record<string, unknown>
          : {};
        const positionInBucket = bucket.indexOf(criterionText);
        const baseMarks = bucket.length ? Math.floor(task.totalMarks / bucket.length) : 0;
        const distributedMarks = baseMarks + (positionInBucket >= 0 && positionInBucket < task.totalMarks % bucket.length ? 1 : 0);
        await tx.recruitmentScenarioCriterionTask.create({
          data: {
            criterionId: criterion.id,
            taskId: task.id,
            expectedCandidateEvidence: roleEvidence.expectedCandidateEvidence,
            rubricElementIds: Object.keys(rubric),
            marks: distributedMarks,
          },
        });
      }
    }

    return scenario;
  });

  return NextResponse.json({
    scenario: {
      id: created.id,
      slug: created.slug,
      title: created.title,
    },
  });
}

/**
 * Find a free slug starting from `base`, appending `-2`, `-3`, ... if
 * needed. Race-safe enough for a single-operator product (the create
 * itself runs in a transaction; in the unlikely event of a concurrent
 * insert wining a slug between the lookup and the insert, the unique
 * constraint will surface a P2002 error which the caller can retry).
 *
 * Truncates to 40 chars to match the auto-derive in the wizard.
 */
async function ensureUniqueSlug(base: string): Promise<string> {
  const trimmedBase = base.slice(0, 40).replace(/-+$/, "") || "scenario";

  const existingSlugs = await prisma.recruitmentScenario.findMany({
    where: { slug: { startsWith: trimmedBase } },
    select: { slug: true },
  });
  const taken = new Set(existingSlugs.map((s) => s.slug));
  taken.add("fam-p4");
  taken.add("aplo-p2");

  if (!taken.has(trimmedBase)) return trimmedBase;

  for (let i = 2; i < 1000; i++) {
    const suffix = `-${i}`;
    // Keep total length under 40 by trimming the base, not the suffix.
    const room = 40 - suffix.length;
    const candidate = `${trimmedBase.slice(0, room).replace(/-+$/, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Astronomical: 1000+ scenarios with the same title prefix. Fall
  // back to a random tail.
  return `${trimmedBase.slice(0, 32).replace(/-+$/, "")}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function defaultMemoSystemPrompt(
  positionTitle: string,
  organisation: string
): string {
  return `You are an internal knowledge-system assistant supporting a candidate being assessed for the role of ${positionTitle} at ${organisation}.

The candidate is reviewing an exhibit document and producing a written deliverable. They may ask you for additional source data, definitions, or clarifying detail about the exhibit.

Rules:
- Answer specific questions only from the supplied scenario material. If a requested detail is not supplied, say so plainly; never invent a fact or source.
- Do NOT volunteer issues, conclusions, or recommendations the candidate hasn't already identified — the candidate's analysis is what's being assessed.
- Do NOT reveal the marking criteria or the "correct" answer.
- Identify yourself transparently as the organisation's AI-powered Knowledge System. Do not claim to be human.
- Keep answers concise and factual; long essays defeat the purpose.`;
}
