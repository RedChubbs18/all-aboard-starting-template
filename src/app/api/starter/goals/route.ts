import { withRole } from "@/lib/auth/server";
import { GOAL_HORIZONS } from "@/domain/types";
import type { GoalHorizon } from "@/domain/types";
import { prisma } from "@/server/db";
import { addGoal } from "@/server/journey-service";
import { resolveJourney } from "../_lib/context";
import { canEditGoals, goalsLockedUntil, type GoalDto } from "../_lib/goals";
import { guard, HttpError, readJson } from "../_lib/http";

/** FR-4.9 / FR-5.1: 30-60-90 goals (starter-editable) and LM cascaded goals (read-only here). */
export const GET = withRole(["STARTER", "BUDDY", "LM", "PNP", "ADMIN"], (req, _ctx, user) =>
  guard(async () => {
    const journey = await resolveJourney(user, new URL(req.url).searchParams.get("journeyId"));
    const lockedUntil = goalsLockedUntil(user, journey);
    const rows = await prisma.goal.findMany({ where: { journeyId: journey.id }, orderBy: { id: "asc" } });
    return Response.json(
      {
        journeyId: journey.id,
        canEdit: canEditGoals(user, journey) && journey.status === "active" && !lockedUntil,
        lockedUntil,
        goals: rows.map((g): GoalDto => ({ id: g.id, horizon: g.horizon as GoalHorizon, text: g.text, done: g.done, authorId: g.authorId })),
      },
      { headers: { "cache-control": "no-store" } },
    );
  }),
);

export const POST = withRole(["STARTER", "LM", "PNP", "ADMIN"], (req, _ctx, user) =>
  guard(async () => {
    const body = await readJson<{ journeyId?: string; horizon?: string; text?: string }>(req);
    const journey = await resolveJourney(user, body.journeyId ?? null);
    if (!canEditGoals(user, journey) || journey.status !== "active") throw new HttpError(403, "forbidden", "You cannot edit these goals");
    if (goalsLockedUntil(user, journey)) throw new HttpError(403, "goals_locked", "You can edit your goals from your first day");
    const horizon = body.horizon as GoalHorizon;
    if (!GOAL_HORIZONS.includes(horizon) || horizon === "CASCADED") throw new HttpError(422, "invalid", "Choose 30, 60 or 90 days");
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 280) throw new HttpError(422, "invalid", "Write a goal of up to 280 characters");
    const g = await addGoal(journey.id, { horizon, text }, user.id);
    const goal: GoalDto = { id: g.id, horizon, text: g.text, done: g.done, authorId: g.authorId };
    return Response.json({ goal }, { status: 201 });
  }),
);
