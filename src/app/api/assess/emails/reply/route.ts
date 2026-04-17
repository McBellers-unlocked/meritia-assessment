import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadCandidate, verifySessionCookie } from "@/lib/recruit/candidate-auth";

export const dynamic = "force-dynamic";

const VALID_ACTIONS = ["replied", "ignored", "flagged"] as const;

/**
 * POST /api/assess/emails/reply
 *   body: { token, emailId, action, replyBody? }
 *
 * Upserts the candidate's response to a scripted email. Action is one of:
 *   - "replied"  — candidate composed a reply (replyBody required, <= 10k chars)
 *   - "ignored"  — candidate chose not to respond
 *   - "flagged"  — candidate flagged for follow-up outside the session
 *
 * Only writable while the assessment is in the "started" state.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();
  const emailId = String(body.emailId ?? "").trim();
  const action = String(body.action ?? "").trim();
  const replyBody = body.replyBody != null ? String(body.replyBody) : null;

  if (!token || !emailId || !action) {
    return NextResponse.json({ error: "token, emailId, action required" }, { status: 400 });
  }
  if (!VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    return NextResponse.json({ error: `action must be one of ${VALID_ACTIONS.join(", ")}` }, { status: 400 });
  }
  if (action === "replied") {
    if (!replyBody || !replyBody.trim()) {
      return NextResponse.json({ error: "replyBody required when action=replied" }, { status: 400 });
    }
    if (replyBody.length > 10_000) {
      return NextResponse.json({ error: "replyBody too long (max 10000 chars)" }, { status: 400 });
    }
  }

  const result = await loadCandidate(token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  if (result.nowExpired || result.candidate.status !== "started") {
    return NextResponse.json({ error: "Assessment is no longer active." }, { status: 400 });
  }

  const cookieOk = await verifySessionCookie(result.candidate);
  if (!cookieOk) return NextResponse.json({ error: "Session mismatch." }, { status: 403 });

  // Verify the email belongs to this candidate's scenario (prevent a candidate
  // from writing a response keyed to an email from a different scenario).
  // We use a join via the scenario -> assessment path.
  const email = await prisma.recruitmentScenarioEmail.findUnique({
    where: { id: emailId },
    select: { id: true, scenarioId: true },
  });
  if (!email) return NextResponse.json({ error: "Email not found" }, { status: 404 });
  if (email.scenarioId !== result.assessment.customScenarioId) {
    return NextResponse.json({ error: "Email does not belong to this candidate's scenario" }, { status: 400 });
  }

  // Look up the delivery timestamp from the activity log so deliveredAt is
  // accurate even if the candidate responds on a subsequent poll.
  const deliveryEvent = await prisma.recruitmentActivityEvent.findFirst({
    where: {
      candidateId: result.candidate.id,
      eventType: "email_delivered",
      metadata: { path: ["emailId"], equals: emailId },
    },
    orderBy: { occurredAt: "asc" },
    select: { occurredAt: true },
  });
  const deliveredAt = deliveryEvent?.occurredAt ?? new Date();

  const response = await prisma.recruitmentEmailResponse.upsert({
    where: {
      candidateId_emailId: { candidateId: result.candidate.id, emailId },
    },
    create: {
      candidateId: result.candidate.id,
      emailId,
      action,
      replyBody: action === "replied" ? replyBody : null,
      deliveredAt,
    },
    update: {
      action,
      replyBody: action === "replied" ? replyBody : null,
      respondedAt: new Date(),
    },
  });

  return NextResponse.json({
    response: {
      action: response.action,
      replyBody: response.replyBody,
      respondedAt: response.respondedAt.toISOString(),
    },
  });
}
