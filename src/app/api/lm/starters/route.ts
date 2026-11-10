import { buildSummaries } from "../_lib/detail";
import { lmRoute, lmScope } from "../_lib/guard";
import { listJourneys, settleForTime } from "@/server/journey-service";

/** FR-LM.1 / F15: the caller's current and upcoming starters, most urgent first, plus past starters (read-only records). */
export const GET = lmRoute(async (_req, _ctx, user) => {
  // D31: advance any journey whose Day 0 / Day 30 date has arrived.
  const journeys = await Promise.all((await listJourneys(lmScope(user))).map((j) => settleForTime(j)));
  const active = journeys.filter((j) => j.status === "active");
  const past = journeys.filter((j) => j.status !== "active").sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  return Response.json({ starters: await buildSummaries(active), past: await buildSummaries(past) });
});
