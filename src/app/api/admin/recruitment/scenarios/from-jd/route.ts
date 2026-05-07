import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireScenarioBuilder } from "@/lib/admin-auth";

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

  // Validate every task before any DB write.
  const tasks: Array<{
    title: string;
    briefMarkdown: string;
    exhibitTitle: string;
    exhibitHtml: string;
    deliverableLabel: string;
    deliverablePlaceholder: string;
    totalMarks: number;
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
    tasks.push({
      title: taskTitle,
      briefMarkdown,
      exhibitTitle,
      exhibitHtml,
      deliverableLabel,
      deliverablePlaceholder,
      totalMarks,
    });
  }

  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.json(
      { error: "slug is reserved by a built-in scenario" },
      { status: 409 }
    );
  }
  const slugClash = await prisma.recruitmentScenario.findUnique({
    where: { slug },
  });
  if (slugClash) {
    return NextResponse.json({ error: "slug already in use" }, { status: 409 });
  }

  // One transaction: scenario header, exhibits, tasks (each linked to its
  // exhibit by id). If anything fails, the whole thing rolls back.
  const created = await prisma.$transaction(async (tx) => {
    const scenario = await tx.recruitmentScenario.create({
      data: {
        title,
        slug,
        organisation,
        positionTitle,
        defaultTotalMinutes,
        jdSourceText: jdText,
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
        },
      });
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

function defaultMemoSystemPrompt(
  positionTitle: string,
  organisation: string
): string {
  return `You are an internal knowledge-system assistant supporting a candidate being assessed for the role of ${positionTitle} at ${organisation}.

The candidate is reviewing an exhibit document and producing a written deliverable. They may ask you for additional source data, definitions, or clarifying detail about the exhibit.

Rules:
- Answer specific questions with specific facts. Invent plausible details consistent with the exhibit when needed.
- Do NOT volunteer issues, conclusions, or recommendations the candidate hasn't already identified — the candidate's analysis is what's being assessed.
- Do NOT reveal the marking criteria or the "correct" answer.
- Stay in character as a knowledge system. Do not mention Claude, Anthropic, or that you are an AI assistant.
- Keep answers concise and factual; long essays defeat the purpose.`;
}
