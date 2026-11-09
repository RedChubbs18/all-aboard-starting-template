import { getAdapter } from "@/adapters/registry";
import { withRole } from "@/lib/auth/server";
import { applyIntegrationStatus, completeTask, loadJourney } from "@/server/journey-service";
import { assertCanAct, findByKey, taskContext } from "../_lib/context";
import { loadDay0 } from "../_lib/detail";
import { guard, HttpError, readJson, str } from "../_lib/http";
import { verifyPhotoRef } from "../_lib/photo-token";

/**
 * FR-3.11. Needs a photo reference that passed the check and a confirmed Day 0 location.
 * Only the reference id is kept (task evidence, pass order). Order goes to the Day 0 location via PassAdapter.
 */
export const POST = withRole(["STARTER", "LM", "PNP", "ADMIN"], (req, _ctx, user) =>
  guard(async () => {
    const body = await readJson<{ taskId?: string; photoRef?: string; token?: string }>(req);
    const taskId = str(body.taskId);
    const photoRef = str(body.photoRef);
    const token = str(body.token, 200);
    if (!taskId || !photoRef || !token) throw new HttpError(400, "bad_request", "taskId, photoRef and token are required");
    const { journey, task } = await taskContext(user, taskId);
    assertCanAct(user, journey, task);
    if (task.key !== "upload-pass-photo") throw new HttpError(409, "wrong_task", "This task does not take a photo");
    if (task.status === "LOCKED") throw new HttpError(409, "locked", "This task is locked");
    if (!verifyPhotoRef(journey.id, photoRef, token)) throw new HttpError(403, "photo_not_checked", "That photo has not passed the check");

    const day0 = await loadDay0(journey.id);
    const confirmed = findByKey(journey, "confirm-day-0-arrangements")?.status === "DONE";
    if (!day0 || !confirmed) throw new HttpError(409, "day0_unconfirmed", "Confirm your Day 0 arrangements first so we know where to send your pass");

    const pass = await getAdapter("pass");
    if (task.status !== "DONE") await completeTask(journey.id, task.key, { actorId: user.id, evidence: photoRef });
    // Photo check task flips to DONE, which unlocks the pass order task.
    await applyIntegrationStatus(journey.id, "photocheck", "ready", { actorId: user.id });
    const order = await pass.orderPass(journey.id, { photoRef, location: day0.where });
    await applyIntegrationStatus(journey.id, "pass", "ordered", { actorId: user.id });
    const after = await loadJourney(journey.id);
    return Response.json({ ok: true, order, currentStage: after?.currentStage });
  }),
);
