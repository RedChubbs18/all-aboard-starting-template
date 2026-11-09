import { withRole } from "@/lib/auth/server";
import { completeTask, confirmDay0 } from "@/server/journey-service";
import { orderPassAfterRecertification } from "@/server/integration-service";
import { assertCanAct, findByKey, taskContext } from "../../_lib/context";
import { guard, HttpError, readJson, str } from "../../_lib/http";
import { loadDay0 } from "../../_lib/detail";

/** FR-3.8: the starter confirms the arrangement their LM proposed, which completes the confirm task. */
export const POST = withRole(["STARTER", "LM", "PNP", "ADMIN"], (req, _ctx, user) =>
  guard(async () => {
    const body = await readJson<{ taskId?: string }>(req);
    const taskId = str(body.taskId);
    if (!taskId) throw new HttpError(400, "bad_request", "taskId is required");
    const { journey, task } = await taskContext(user, taskId);
    assertCanAct(user, journey, task);
    if (task.key !== "confirm-day-0-arrangements") throw new HttpError(409, "wrong_task", "This task is not the Day 0 confirmation");
    if (task.status === "LOCKED") throw new HttpError(409, "locked", "Your line manager has not proposed Day 0 arrangements yet");
    if (!(await loadDay0(journey.id))) throw new HttpError(409, "no_proposal", "Your line manager has not proposed Day 0 arrangements yet");
    await confirmDay0(journey.id, user.id);
    if (findByKey(journey, task.key)?.status !== "DONE") await completeTask(journey.id, task.key, { actorId: user.id });
    await orderPassAfterRecertification(journey.id, { actorId: user.id }); // D12: an earlier recertified photo can now be ordered
    return Response.json({ ok: true, day0: await loadDay0(journey.id) });
  }),
);
