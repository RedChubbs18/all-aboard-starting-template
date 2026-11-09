import { buildDetail } from "../../../_lib/detail";
import { HttpError, lmRoute, parseBody, requireManagedJourney, type JourneyParams } from "../../../_lib/guard";
import { buddySchema } from "@/components/lm/schemas";
import { prisma } from "@/server/db";
import { allocateBuddy } from "@/server/journey-service";

/** FR-LM.4 / FR-1.3: allocate a buddy from the starter's team. Not the LM, not the starter, must be buddy-eligible. */
export const POST = lmRoute<JourneyParams>(async (req, ctx, user) => {
  const { journeyId } = await ctx.params;
  const j = await requireManagedJourney(journeyId, user);
  const { buddyId } = await parseBody(req, buddySchema);
  const buddy = await prisma.user.findUnique({ where: { id: buddyId } });
  const fail = (m: string) => new HttpError(400, "invalid", m, { buddyId: m });
  if (!buddy) throw fail("That person was not found");
  if (buddyId === j.lmId) throw fail("You cannot be your own starter's buddy");
  if (buddyId === j.starterId) throw fail("The starter cannot be their own buddy");
  if (buddy.teamId !== j.teamId) throw fail("Choose someone from the starter's team");
  if (!buddy.buddyEligible) throw fail("That person is not buddy-eligible");
  await allocateBuddy(journeyId, buddyId, user.id);
  return Response.json(await buildDetail(journeyId, user));
});
