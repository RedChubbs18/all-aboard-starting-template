import { buildDetail } from "../../../../_lib/detail";
import { HttpError, lmRoute, parseBody, requireWritableJourney } from "../../../../_lib/guard";
import { goalPatchSchema } from "@/components/lm/schemas";
import { prisma } from "@/server/db";
import { updateGoal } from "@/server/journey-service";

/** Edit a goal's text or tick it off. The goal must belong to this (managed) journey. */
export const PATCH = lmRoute<{ params: Promise<{ journeyId: string; goalId: string }> }>(async (req, ctx, user) => {
  const { journeyId, goalId } = await ctx.params;
  await requireWritableJourney(journeyId, user);
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal || goal.journeyId !== journeyId) throw new HttpError(404, "not_found", "Goal not found");
  const v = await parseBody(req, goalPatchSchema);
  await updateGoal(goalId, v, user.id);
  return Response.json(await buildDetail(journeyId, user));
});
