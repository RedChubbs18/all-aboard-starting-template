import { buildDetail } from "../../_lib/detail";
import { lmRoute, requireManagedJourney, type JourneyParams } from "../../_lib/guard";

/** FR-LM.2: one starter's journey, tasks, buddy, check-ins, goals and Day 0. */
export const GET = lmRoute<JourneyParams>(async (_req, ctx, user) => {
  const { journeyId } = await ctx.params;
  await requireManagedJourney(journeyId, user);
  return Response.json(await buildDetail(journeyId, user));
});
