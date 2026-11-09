import { withRole } from "@/lib/auth/server";
import { prisma } from "@/server/db";
import { loadJourney, updateGoal } from "@/server/journey-service";
import { canEditGoals, goalsLockedUntil } from "../../_lib/goals";
import { guard, HttpError, readJson } from "../../_lib/http";

/** Edit text or tick a 30-60-90 goal. Cascaded goals are the LM's and read-only for the starter. */
export const PATCH = withRole<{ params: Promise<{ id: string }> }>(["STARTER", "LM", "PNP", "ADMIN"], (req, ctx, user) =>
  guard(async () => {
    const { id } = await ctx.params;
    const goal = await prisma.goal.findUnique({ where: { id } });
    if (!goal) throw new HttpError(404, "not_found", "Goal not found");
    const journey = await loadJourney(goal.journeyId);
    if (!journey) throw new HttpError(404, "not_found", "Journey not found");
    if (!canEditGoals(user, journey) || journey.status !== "active") throw new HttpError(403, "forbidden", "You cannot edit this goal");
    if (goalsLockedUntil(user, journey)) throw new HttpError(403, "goals_locked", "You can edit your goals from your first day");
    if (goal.horizon === "CASCADED" && journey.starterId === user.id) throw new HttpError(403, "forbidden", "Cascaded goals are set by your line manager");
    const body = await readJson<{ text?: unknown; done?: unknown }>(req);
    const patch: { text?: string; done?: boolean } = {};
    if (body.text !== undefined) {
      const t = typeof body.text === "string" ? body.text.trim() : "";
      if (!t || t.length > 280) throw new HttpError(422, "invalid", "Write a goal of up to 280 characters");
      patch.text = t;
    }
    if (body.done !== undefined) {
      if (typeof body.done !== "boolean") throw new HttpError(422, "invalid", "done must be true or false");
      patch.done = body.done;
    }
    if (!Object.keys(patch).length) throw new HttpError(400, "bad_request", "Nothing to update");
    const g = await updateGoal(id, patch, user.id);
    return Response.json({ goal: { id: g.id, horizon: g.horizon, text: g.text, done: g.done, authorId: g.authorId } });
  }),
);
