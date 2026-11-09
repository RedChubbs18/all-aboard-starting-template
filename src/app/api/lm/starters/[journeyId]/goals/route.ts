import { buildDetail } from "../../../_lib/detail";
import { lmRoute, parseBody, requireWritableJourney, type JourneyParams } from "../../../_lib/guard";
import { goalSchema } from "@/components/lm/schemas";
import { addGoal } from "@/server/journey-service";

/** FR-4.9 / FR-5.1: add a 30, 60 or 90 day goal, or a CASCADED performance goal. */
export const POST = lmRoute<JourneyParams>(async (req, ctx, user) => {
  const { journeyId } = await ctx.params;
  await requireWritableJourney(journeyId, user);
  const v = await parseBody(req, goalSchema);
  await addGoal(journeyId, v, user.id);
  return Response.json(await buildDetail(journeyId, user), { status: 201 });
});
