import { buildSummaries } from "../_lib/detail";
import { lmRoute, lmScope } from "../_lib/guard";
import { listJourneys } from "@/server/journey-service";

/** FR-LM.1 / F15: the caller's current and upcoming starters, most urgent first, plus past starters (read-only records). */
export const GET = lmRoute(async (_req, _ctx, user) => {
  const journeys = await listJourneys(lmScope(user));
  const active = journeys.filter((j) => j.status === "active");
  const past = journeys.filter((j) => j.status !== "active").sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  return Response.json({ starters: await buildSummaries(active), past: await buildSummaries(past) });
});
