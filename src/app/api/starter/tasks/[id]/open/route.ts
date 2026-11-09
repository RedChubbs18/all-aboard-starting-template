import { withRole } from "@/lib/auth/server";
import { requiresFlow } from "@/components/journey/task-rules";
import { completeTask } from "@/server/journey-service";
import { assertCanAct, taskContext } from "../../../_lib/context";
import { guard } from "../../../_lib/http";

/**
 * F4: opening a read/info task (flag `autoCompleteOnOpen`) completes it. Goes through the journey
 * service, so the engine unlocks dependants and the change is audited like any other completion.
 * Anything not eligible is a quiet no-op (`completed: false`), so the page can call this on every open.
 */
export const POST = withRole<{ params: Promise<{ id: string }> }>(["STARTER", "BUDDY", "LM", "PNP", "ADMIN"], (_req, ctx, user) =>
  guard(async () => {
    const { id } = await ctx.params;
    const { journey, task } = await taskContext(user, id);
    const eligible =
      task.autoCompleteOnOpen &&
      task.owner === "STARTER" &&
      journey.starterId === user.id && // an LM or P&P looking at the task must not complete it for the starter
      (task.status === "TODO" || task.status === "IN_PROGRESS") &&
      !requiresFlow(task) &&
      journey.status === "active";
    if (!eligible) return Response.json({ ok: true, completed: false });
    assertCanAct(user, journey, task);
    const next = await completeTask(journey.id, task.key, { actorId: user.id, evidence: "opened" });
    return Response.json({ ok: true, completed: true, currentStage: next.currentStage });
  }),
);
