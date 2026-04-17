import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadCandidate, verifySessionCookie } from "@/lib/recruit/candidate-auth";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "paste",
  "visibility_hidden",
  "visibility_visible",
]);
const MAX_EVENTS_PER_CALL = 50;

type IncomingEvent = {
  type?: unknown;
  taskNumber?: unknown;
  metadata?: unknown;
  occurredAt?: unknown;
};

/**
 * Append integrity/activity events for a candidate session. Body:
 *   { token, events: [{ type, taskNumber?, metadata?, occurredAt? }] }
 *
 * Clients buffer events (paste, visibilitychange) and flush in small batches.
 * We don't capture pasted content — only char length — so the store contains
 * no sensitive clipboard data.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token ?? "").trim();
    const events = Array.isArray(body.events) ? (body.events as IncomingEvent[]) : [];

    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
    if (events.length === 0) return NextResponse.json({ ok: true, inserted: 0 });
    if (events.length > MAX_EVENTS_PER_CALL) {
      return NextResponse.json({ error: "too many events in one call" }, { status: 400 });
    }

    const result = await loadCandidate(token);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    if (result.candidate.status !== "started") {
      return NextResponse.json({ ok: true, inserted: 0 });
    }
    const cookieOk = await verifySessionCookie(result.candidate);
    if (!cookieOk) return NextResponse.json({ error: "Session mismatch." }, { status: 403 });

    const candidateId = result.candidate.id;
    const rows: Prisma.RecruitmentActivityEventCreateManyInput[] = [];
    for (const ev of events) {
      const type = String(ev.type ?? "");
      if (!ALLOWED_TYPES.has(type)) continue;
      const taskNumber = ev.taskNumber === 1 || ev.taskNumber === 2 ? (ev.taskNumber as 1 | 2) : null;
      const occurredAt = typeof ev.occurredAt === "string" ? new Date(ev.occurredAt) : new Date();
      const metadata =
        ev.metadata && typeof ev.metadata === "object" && !Array.isArray(ev.metadata)
          ? (ev.metadata as Prisma.InputJsonValue)
          : undefined;
      rows.push({ candidateId, eventType: type, taskNumber, occurredAt, ...(metadata ? { metadata } : {}) });
    }

    if (rows.length === 0) return NextResponse.json({ ok: true, inserted: 0 });

    await prisma.recruitmentActivityEvent.createMany({ data: rows });
    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (e) {
    console.error("[assess activity]", e);
    return NextResponse.json({ error: (e as Error).message || "Log failed" }, { status: 500 });
  }
}
