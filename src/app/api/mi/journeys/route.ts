import { withRole } from "@/lib/auth/server";
import { listJourneys } from "@/server/journey-service";
import { prisma } from "@/server/db";

/** Placeholder MI feed (P&P and admin only). WS3 builds on this. */
export const GET = withRole(["PNP", "ADMIN"], async () => {
  const journeys = await listJourneys();
  const byStage: Record<string, number> = {};
  for (const j of journeys) byStage[j.currentStage] = (byStage[j.currentStage] ?? 0) + 1;
  return Response.json({
    total: journeys.length,
    byStage,
    flagged: journeys.filter((j) => j.flagged).map((j) => ({ id: j.id, reason: j.flagReason })),
    exited: journeys.filter((j) => j.status === "exited").map((j) => ({ id: j.id, stage: j.exitStage, reason: j.exitReason })),
    events: await prisma.event.count(),
  });
});
