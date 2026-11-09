import { buildDetail } from "../../../_lib/detail";
import { lmRoute, parseBody, requireWritableJourney, type JourneyParams } from "../../../_lib/guard";
import { teamItemSchema } from "@/components/lm/schemas";
import { addBespokeTask, loadJourney } from "@/server/journey-service";

/** F11: add a team checklist item (TEAM source). Owned by the LM, or by the starter if the LM chooses. */
export const POST = lmRoute<JourneyParams>(async (req, ctx, user) => {
  const { journeyId } = await ctx.params;
  await requireWritableJourney(journeyId, user);
  const v = await parseBody(req, teamItemSchema);
  const j = await loadJourney(journeyId);
  await addBespokeTask(
    journeyId,
    {
      title: v.title,
      description: v.description,
      stage: j!.currentStage,
      dueDate: new Date(`${v.dueDate.slice(0, 10)}T12:00:00.000Z`),
      owner: v.owner,
      type: "CHECKLIST",
      source: "TEAM",
    },
    { actorId: user.id },
  );
  return Response.json(await buildDetail(journeyId, user), { status: 201 });
});
