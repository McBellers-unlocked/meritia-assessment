import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadCandidate, verifySessionCookie, COOKIE_NAME } from "@/lib/recruit/candidate-auth";
import { generateSessionToken, hashIp } from "@/lib/recruit/tokens";

export const dynamic = "force-dynamic";

/**
 * Begin (or resume) the candidate's assessment.
 *
 * Body: { token }
 *
 *  - If status is "invited": stamp startedAt + deadline, generate sessionToken,
 *    set the recruit_session cookie, return state. The clock starts now.
 *  - If status is "started" and the cookie matches: resume.
 *  - If status is "started" but cookie does not match: 403, no state leaked.
 *  - If status is "submitted": 200 but with submitted=true so the UI shows
 *    the read-only "thank you" view.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token ?? "").trim();
    const result = await loadCandidate(token);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const { assessment, nowExpired } = result;
    let { candidate } = result;

    if (candidate.status === "submitted") {
      return NextResponse.json({
        ok: true,
        submitted: true,
        expired: nowExpired,
        candidateAnonymousId: candidate.anonymousId,
        submittedAt: candidate.submittedAt,
      });
    }

    if (candidate.status === "invited") {
      const sessionToken = generateSessionToken();
      const now = new Date();
      const deadline = new Date(now.getTime() + assessment.totalMinutes * 60_000);
      const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || null;
      const ua = request.headers.get("user-agent") ?? null;

      candidate = await prisma.recruitmentCandidate.update({
        where: { id: candidate.id },
        data: {
          status: "started",
          startedAt: now,
          deadline,
          sessionToken,
          sessionUserAgent: ua,
          sessionIpHash: hashIp(ip),
        },
      });

      const res = NextResponse.json({
        ok: true,
        submitted: false,
        startedAt: candidate.startedAt,
        deadline: candidate.deadline,
      });
      res.cookies.set(COOKIE_NAME, `${candidate.token}:${sessionToken}`, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: assessment.totalMinutes * 60 * 2, // generous: 2× window
      });
      return res;
    }

    // status === "started" — resume only if cookie matches
    const cookieOk = await verifySessionCookie(candidate);
    if (!cookieOk) {
      return NextResponse.json(
        {
          error:
            "This assessment has already been started in another browser session. " +
            "If this is your device and you have lost your cookie, contact the recruiter.",
        },
        { status: 403 }
      );
    }
    return NextResponse.json({
      ok: true,
      submitted: false,
      startedAt: candidate.startedAt,
      deadline: candidate.deadline,
    });
  } catch (e) {
    console.error("[assess start]", e);
    return NextResponse.json({ error: (e as Error).message || "Start failed" }, { status: 500 });
  }
}
