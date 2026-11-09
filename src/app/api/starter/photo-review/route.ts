import { withRole } from "@/lib/auth/server";
import { applyIntegrationStatus, recordEvent } from "@/server/journey-service";
import { assertCanAct, taskContext } from "../_lib/context";
import { guard, HttpError, readJson, str } from "../_lib/http";

/**
 * FR-3.12 manual route: the starter asks for a person to review a rejected photo. The photo-check task is
 * set to "action needed", which makes the P&P override task applicable (and flags the journey). P&P or the
 * line manager then recertify on their side. No image is sent or kept.
 */
export const POST = withRole(["STARTER", "LM", "PNP", "ADMIN"], (req, _ctx, user) =>
  guard(async () => {
    const body = await readJson<{ taskId?: string }>(req);
    const taskId = str(body.taskId);
    if (!taskId) throw new HttpError(400, "bad_request", "taskId is required");
    const { journey, task } = await taskContext(user, taskId);
    assertCanAct(user, journey, task);
    if (task.key !== "upload-pass-photo") throw new HttpError(409, "wrong_task", "This task does not take a photo");
    await applyIntegrationStatus(journey.id, "photocheck", "action_needed", { actorId: user.id, detail: "Photo was not accepted. The starter asked for a review." });
    await recordEvent({ journeyId: journey.id, actorId: user.id, type: "SUPPORT_RAISED", entity: "Task", entityId: task.id, data: { reason: "photo_review_requested" } });
    return Response.json({ ok: true });
  }),
);
