import { buildDetail } from "../../../_lib/detail";
import { lmRoute, parseBody, requireManagedJourney, type JourneyParams } from "../../../_lib/guard";
import { day0Schema } from "@/components/lm/schemas";
import { proposeDay0 } from "@/server/journey-service";

/** FR-3.8: propose (or re-propose) the Day 0 arrangement. Re-proposing clears the starter's confirmation. */
export const PUT = lmRoute<JourneyParams>(async (req, ctx, user) => {
  const { journeyId } = await ctx.params;
  await requireManagedJourney(journeyId, user);
  const v = await parseBody(req, day0Schema);
  await proposeDay0(journeyId, { where: v.where, who: v.who, whenAt: new Date(v.whenAt) }, user.id);
  return Response.json(await buildDetail(journeyId, user));
});
