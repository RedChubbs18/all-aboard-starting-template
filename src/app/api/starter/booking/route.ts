import { getAdapter } from "@/adapters/registry";
import { withRole } from "@/lib/auth/server";
import { completeTask, recordEvent } from "@/server/journey-service";
import { assertCanAct, findByKey, taskContext } from "../_lib/context";
import { guard, HttpError, readJson, str } from "../_lib/http";

/**
 * FR-3.9 induction booking via BookingAdapter. Booking from the Day 0 fallback (FR-4.5) completes the
 * original `book-induction` task, which also makes the fallback not applicable (template condition).
 */
export const POST = withRole(["STARTER", "LM", "PNP", "ADMIN"], (req, _ctx, user) =>
  guard(async () => {
    const body = await readJson<{ taskId?: string; sessionId?: string }>(req);
    const taskId = str(body.taskId);
    const sessionId = str(body.sessionId);
    if (!taskId || !sessionId) throw new HttpError(400, "bad_request", "taskId and sessionId are required");
    const { journey, task } = await taskContext(user, taskId);
    assertCanAct(user, journey, task);
    if (task.type !== "BOOKING") throw new HttpError(409, "wrong_task", "This task is not a booking");
    if (task.status === "LOCKED") throw new HttpError(409, "locked", "This task is locked");
    const booking = await getAdapter("booking");
    let result;
    try {
      result = await booking.book(journey.id, sessionId);
    } catch (e) {
      throw new HttpError(422, "invalid", e instanceof Error ? e.message : "Could not book that session");
    }
    const primary = task.key === "book-induction-fallback" ? findByKey(journey, "book-induction") : task;
    if (primary && primary.status !== "DONE" && primary.status !== "LOCKED") {
      await completeTask(journey.id, primary.key, { actorId: user.id, evidence: `booking:${result.sessionId}` });
    } else if (task.status !== "DONE" && task.key !== "book-induction-fallback") {
      await completeTask(journey.id, task.key, { actorId: user.id, evidence: `booking:${result.sessionId}` });
    } else {
      // Rebooking on an already-done task changes adapter state without a task transition, so audit it (L3).
      await recordEvent({ journeyId: journey.id, actorId: user.id, type: "BOOKING_CHANGED", entity: "Task", entityId: task.id, data: { key: task.key, sessionId: result.sessionId } });
    }
    return Response.json({ ok: true, booking: result });
  }),
);
