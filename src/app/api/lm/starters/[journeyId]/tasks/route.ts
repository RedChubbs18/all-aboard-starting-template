import { buildDetail } from "../../../_lib/detail";
import { lmRoute, parseBody, requireManagedJourney, type JourneyParams } from "../../../_lib/guard";
import { bespokeTaskSchema } from "@/components/lm/schemas";
import { addBespokeTask } from "@/server/journey-service";

/** FR-3.6: add a bespoke task. It is owned by the starter and appears on their journey immediately. */
export const POST = lmRoute<JourneyParams>(async (req, ctx, user) => {
  const { journeyId } = await ctx.params;
  await requireManagedJourney(journeyId, user);
  const v = await parseBody(req, bespokeTaskSchema);
  await addBespokeTask(
    journeyId,
    { title: v.title, description: v.description, stage: v.stage, dueDate: new Date(`${v.dueDate.slice(0, 10)}T12:00:00.000Z`), owner: "STARTER" },
    { actorId: user.id },
  );
  return Response.json(await buildDetail(journeyId, user), { status: 201 });
});
