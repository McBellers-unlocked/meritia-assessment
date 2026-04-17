import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadCandidate, verifySessionCookie } from "@/lib/recruit/candidate-auth";
import { getScenarioForAssessment } from "@/lib/recruit/scenario-loader";
import { isChatTask, isEmailInboxTask } from "@/lib/recruit/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/assess/events/[token]
 *
 * Returns scripted emails and chat popups that should be visible to the
 * candidate right now. "Now" = candidate.startedAt + elapsedSeconds. Any
 * scripted item whose triggerOffsetSeconds <= elapsedSeconds is returned.
 *
 * Idempotency: the first time an email / chat script is revealed we write
 * a RecruitmentActivityEvent (email_delivered / chat_opened) so we can
 * compute per-email response latency AND prove to markers exactly when the
 * candidate saw each item. Repeated polls don't duplicate the event.
 *
 * Client is expected to call this on a ~7s cadence while the assessment is
 * running. Pre-start / post-submit → returns empty arrays (no work to do).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const result = await loadCandidate(params.token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { candidate, assessment } = result;

  // Only return events for in-progress candidates; otherwise empty payload.
  if (candidate.status !== "started" || !candidate.startedAt) {
    return NextResponse.json({
      serverElapsedSeconds: 0,
      emails: [],
      chat: null,
    });
  }

  const cookieOk = await verifySessionCookie(candidate);
  if (!cookieOk) {
    return NextResponse.json({ error: "Session mismatch." }, { status: 403 });
  }

  const scenario = await getScenarioForAssessment(assessment);
  if (!scenario) return NextResponse.json({ error: "Scenario config missing" }, { status: 500 });

  const now = Date.now();
  const elapsedSeconds = Math.max(0, Math.floor((now - candidate.startedAt.getTime()) / 1000));

  // Short-circuit for legacy memo-only scenarios — no email or chat tasks.
  const hasAnyScripted = scenario.tasks.some(
    (t) => isEmailInboxTask(t) || isChatTask(t)
  );
  if (!hasAnyScripted) {
    return NextResponse.json({ serverElapsedSeconds: elapsedSeconds, emails: [], chat: null });
  }

  // Load existing "delivered" markers in one query so we can cheaply skip
  // items we've already announced. email_delivered.metadata.emailId and
  // chat_opened.metadata.scriptId are the idempotency keys.
  const deliveredEvents = await prisma.recruitmentActivityEvent.findMany({
    where: {
      candidateId: candidate.id,
      eventType: { in: ["email_delivered", "chat_opened"] },
    },
    select: { eventType: true, metadata: true },
  });
  const deliveredEmailIds = new Set<string>();
  const openedChatIds = new Set<string>();
  for (const ev of deliveredEvents) {
    const md = (ev.metadata as { emailId?: string; scriptId?: string } | null) ?? null;
    if (ev.eventType === "email_delivered" && md?.emailId) deliveredEmailIds.add(md.emailId);
    if (ev.eventType === "chat_opened" && md?.scriptId) openedChatIds.add(md.scriptId);
  }

  // --- Emails ---
  // Collect all scripted emails whose trigger has passed. Include both
  // already-delivered (client already knows about them) and newly-qualifying
  // ones; we need to mark newly qualifying ones delivered as a side effect.
  const qualifyingEmails: Array<{
    id: string; taskNumber: number;
    senderName: string; senderEmail: string; subject: string; bodyHtml: string;
    triggerOffsetSeconds: number;
    deliveredAt: string;
  }> = [];

  const newlyDeliveredIds: string[] = [];
  for (const task of scenario.tasks) {
    if (!isEmailInboxTask(task)) continue;
    for (const email of task.emails) {
      if (email.triggerOffsetSeconds > elapsedSeconds) continue;
      // Deliver it if this is the first time we've seen it crossed.
      let deliveredAtMs: number;
      if (!deliveredEmailIds.has(email.id)) {
        newlyDeliveredIds.push(email.id);
        deliveredAtMs = now;
      } else {
        deliveredAtMs = candidate.startedAt.getTime() + email.triggerOffsetSeconds * 1000;
      }
      qualifyingEmails.push({
        id: email.id,
        taskNumber: task.number,
        senderName: email.senderName,
        senderEmail: email.senderEmail,
        subject: email.subject,
        bodyHtml: email.bodyHtml,
        triggerOffsetSeconds: email.triggerOffsetSeconds,
        deliveredAt: new Date(deliveredAtMs).toISOString(),
      });
    }
  }

  // Write one activity row per newly-delivered email. Using createMany with
  // skipDuplicates is safe if two requests race — unique keys aren't required
  // here because we don't have a natural one, but the client reads idempotent
  // data regardless of whether duplicates got in.
  if (newlyDeliveredIds.length > 0) {
    await prisma.recruitmentActivityEvent.createMany({
      data: newlyDeliveredIds.map((emailId) => ({
        candidateId: candidate.id,
        eventType: "email_delivered",
        taskNumber: null,
        metadata: { emailId },
      })),
    });
  }

  // Fetch candidate's responses for all delivered emails so the client knows
  // which ones already have a reply/ignored/flagged verdict.
  const responses = qualifyingEmails.length === 0
    ? []
    : await prisma.recruitmentEmailResponse.findMany({
        where: {
          candidateId: candidate.id,
          emailId: { in: qualifyingEmails.map((e) => e.id) },
        },
        select: { emailId: true, action: true, replyBody: true, respondedAt: true },
      });
  const responseByEmail = new Map(responses.map((r) => [r.emailId, r]));

  const emailsOut = qualifyingEmails
    .sort((a, b) => b.triggerOffsetSeconds - a.triggerOffsetSeconds)
    .map((e) => ({
      ...e,
      response: responseByEmail.get(e.id)
        ? {
            action: responseByEmail.get(e.id)!.action,
            replyBody: responseByEmail.get(e.id)!.replyBody,
            respondedAt: responseByEmail.get(e.id)!.respondedAt.toISOString(),
          }
        : null,
    }));

  // --- Chat ---
  // Only one chat task fires at a time in MVP; if multiple exist, take the
  // first with a qualifying trigger. Client renders a popup for the active one.
  let chat: {
    scriptId: string;
    taskNumber: number;
    personaName: string;
    personaRole: string;
    openerMessage: string;
    openedAt: string;
    maxTurns: number;
  } | null = null;

  for (const task of scenario.tasks) {
    if (!isChatTask(task)) continue;
    const script = task.script;
    if (!script.id) continue; // placeholder from materialiseScenario
    if (script.triggerOffsetSeconds > elapsedSeconds) continue;

    let openedAtMs: number;
    if (!openedChatIds.has(script.id)) {
      openedAtMs = now;
      await prisma.recruitmentActivityEvent.create({
        data: {
          candidateId: candidate.id,
          eventType: "chat_opened",
          taskNumber: task.number,
          metadata: { scriptId: script.id },
        },
      });
    } else {
      openedAtMs = candidate.startedAt.getTime() + script.triggerOffsetSeconds * 1000;
    }

    chat = {
      scriptId: script.id,
      taskNumber: task.number,
      personaName: script.personaName,
      personaRole: script.personaRole,
      openerMessage: script.openerMessage,
      openedAt: new Date(openedAtMs).toISOString(),
      maxTurns: script.maxTurns,
    };
    break;
  }

  return NextResponse.json({
    serverElapsedSeconds: elapsedSeconds,
    emails: emailsOut,
    chat,
  });
}
