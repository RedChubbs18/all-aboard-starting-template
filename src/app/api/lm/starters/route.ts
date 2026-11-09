import { buildSummaries } from "../_lib/detail";
import { lmRoute, lmScope } from "../_lib/guard";
import { listJourneys } from "@/server/journey-service";

/** FR-LM.1: the caller's current and upcoming starters, most urgent first. */
export const GET = lmRoute(async (_req, _ctx, user) => {
  const journeys = await listJourneys({ AND: [lmScope(user), { status: "active" }] });
  return Response.json({ starters: await buildSummaries(journeys) });
});
