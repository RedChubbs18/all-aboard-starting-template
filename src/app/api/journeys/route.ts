import { withRole } from "@/lib/auth/server";
import { journeyScopeWhere } from "@/lib/auth/access";
import { computeProgress, listJourneys } from "@/server/journey-service";
import { prisma } from "@/server/db";

/** Journeys visible to the caller (starter: own, buddy: allocated, LM: own starters, PNP/ADMIN: all). */
export const GET = withRole(["STARTER", "BUDDY", "LM", "PNP", "ADMIN"], async (_req, _ctx, user) => {
  const journeys = await listJourneys(journeyScopeWhere(user));
  const people = await prisma.user.findMany({ where: { id: { in: journeys.flatMap((j) => [j.starterId, j.lmId, j.buddyId ?? ""]) } } });
  const name = (id: string | null) => people.find((p) => p.id === id)?.displayName ?? null;
  const now = new Date();
  return Response.json({
    journeys: journeys.map((j) => {
      const p = computeProgress(j, now);
      return {
        id: j.id, starter: name(j.starterId), lm: name(j.lmId), buddy: name(j.buddyId), stage: j.currentStage,
        status: j.status, flagged: j.flagged, flagReason: j.flagReason, startDate: j.startDate,
        percent: p.percent, remaining: p.remaining, overdue: p.overdue.length, blocked: p.blocked.length,
        nextDue: p.nextDue.slice(0, 3).map((t) => ({ key: t.key, title: t.title, dueDate: t.dueDate, status: t.status })),
      };
    }),
  });
});
