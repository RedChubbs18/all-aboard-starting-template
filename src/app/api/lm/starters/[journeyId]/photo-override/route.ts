import { z } from "zod";
import { buildDetail, PHOTO_OVERRIDE_KEY } from "../../../_lib/detail";
import { HttpError, lmRoute, parseBody, requireManagedJourney, type JourneyParams } from "../../../_lib/guard";
import { canActOnTask } from "@/lib/auth/access";
import { completeTask as engineComplete } from "@/domain/engine";
import { mutateJourney } from "@/server/journey-service";

const schema = z.object({
  justification: z
    .string({ error: "Justification is required" })
    .trim()
    .min(5, "Please give a short justification (at least 5 characters)")
    .max(300, "Justification must be 300 characters or fewer"),
});

/**
 * D12: the starter's LM recertifies a rejected pass photo (canActOnTask allows the journey's LM
 * for this PNP-owned task). The justification is recorded in the audit event; the image is never stored.
 */
export const POST = lmRoute<JourneyParams>(async (req, ctx, user) => {
  const { journeyId } = await ctx.params;
  const ref = await requireManagedJourney(journeyId, user);
  if (!canActOnTask(user, ref, "PNP", PHOTO_OVERRIDE_KEY)) throw new HttpError(403, "forbidden", "You cannot recertify this photo");
  const { justification } = await parseBody(req, schema);
  await mutateJourney(journeyId, (j) => {
    const t = j.tasks.find((x) => x.key === PHOTO_OVERRIDE_KEY && x.applicable);
    if (!t) throw new HttpError(404, "not_found", "There is no photo check to review");
    if (t.status === "DONE") throw new HttpError(409, "conflict", "This photo has already been recertified");
    const r = engineComplete(j, PHOTO_OVERRIDE_KEY, { actorId: user.id });
    return {
      journey: r.journey,
      events: [
        ...r.events,
        {
          journeyId, actorId: user.id, type: "PHOTO_OVERRIDE", entity: "Task", entityId: t.id, from: null, to: "DONE",
          data: { justification, by: "LM" }, createdAt: new Date(),
        },
      ],
    };
  });
  return Response.json(await buildDetail(journeyId, user));
});
