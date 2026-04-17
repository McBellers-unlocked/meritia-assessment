import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * Dashboard data for one assessment: assessment metadata, status counts,
 * names of candidates who haven't started (so the admin can chase them),
 * and a list of all candidates for the bottom-of-page table.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const a = await prisma.recruitmentAssessment.findUnique({
    where: { id: params.id },
    include: {
      candidates: {
        orderBy: { anonymousId: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          token: true,
          anonymousId: true,
          status: true,
          startedAt: true,
          submittedAt: true,
          deadline: true,
        },
      },
    },
  });
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const counts = { invited: 0, started: 0, submitted: 0, expired: 0 } as Record<string, number>;
  for (const c of a.candidates) counts[c.status] = (counts[c.status] || 0) + 1;
  const notStarted = a.candidates.filter((c) => c.status === "invited").map((c) => ({
    id: c.id, name: c.name, email: c.email,
  }));

  return NextResponse.json({
    assessment: {
      id: a.id,
      title: a.title,
      scenarioSlug: a.scenarioSlug,
      scenarioId: a.scenarioId,
      totalMinutes: a.totalMinutes,
      openDate: a.openDate,
      closeDate: a.closeDate,
      revealedAt: a.revealedAt,
      createdAt: a.createdAt,
    },
    counts,
    notStarted,
    candidates: a.candidates,
  });
}
