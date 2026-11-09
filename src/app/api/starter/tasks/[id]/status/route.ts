import { withRole } from "@/lib/auth/server";
import type { TaskStatus } from "@/domain/types";
import { requiresFlow } from "@/components/journey/task-rules";
import { completeTask, setTaskStatus } from "@/server/journey-service";
import { assertCanAct, taskContext } from "../../../_lib/context";
import { guard, HttpError, readJson } from "../../../_lib/http";

const ALLOWED: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

/** Move a task to TODO (reopen), IN_PROGRESS or DONE. Goes through the journey service, so the engine unlocks dependants and audits it. */
export const POST = withRole<{ params: Promise<{ id: string }> }>(["STARTER", "BUDDY", "LM", "PNP", "ADMIN"], (req, ctx, user) =>
  guard(async () => {
    const { id } = await ctx.params;
    const body = await readJson<{ status?: string }>(req);
    const status = body.status as TaskStatus;
    if (!ALLOWED.includes(status)) throw new HttpError(400, "bad_status", "status must be TODO, IN_PROGRESS or DONE");
    const { journey, task } = await taskContext(user, id);
    assertCanAct(user, journey, task);
    if (task.status === "LOCKED") throw new HttpError(409, "locked", "This task is locked until its earlier steps are done");
    if (status === "DONE" && requiresFlow(task)) {
      throw new HttpError(409, "needs_flow", "Complete this task with its own action (booking, order, photo or confirmation)");
    }
    const next = status === "DONE" ? await completeTask(journey.id, task.key, { actorId: user.id }) : await setTaskStatus(journey.id, task.key, status, { actorId: user.id });
    return Response.json({ ok: true, status: next.tasks.find((t) => t.id === id)?.status, currentStage: next.currentStage });
  }),
);
