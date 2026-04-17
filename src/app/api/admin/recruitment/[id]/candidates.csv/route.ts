import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * CSV export of all candidates for an assessment, ready to paste into a mail
 * merge or email each candidate individually:
 *
 *   anonymous_id, name, email, token, assessment_url, status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const a = await prisma.recruitmentAssessment.findUnique({ where: { id: params.id } });
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const candidates = await prisma.recruitmentCandidate.findMany({
    where: { assessmentId: a.id },
    orderBy: { anonymousId: "asc" },
    select: {
      anonymousId: true, name: true, email: true, token: true, status: true,
    },
  });

  const origin = process.env.NEXTAUTH_URL || `https://${request.headers.get("host") ?? "meritia.example"}`;
  const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const header = ["anonymous_id", "name", "email", "token", "assessment_url", "status"].join(",");
  const lines = candidates.map((c) =>
    [
      escape(c.anonymousId),
      escape(c.name),
      escape(c.email),
      escape(c.token),
      escape(`${origin}/assess/${a.scenarioSlug}?token=${c.token}`),
      escape(c.status),
    ].join(",")
  );
  const csv = [header, ...lines].join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${a.scenarioSlug}-candidates-${a.id}.csv"`,
    },
  });
}
