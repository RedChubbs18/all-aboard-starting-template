/**
 * Auto-complete the `guest-sign-in` task the first time a starter signs in through Entra (D24).
 * Goes through journey-service; audited with a GUEST_SIGNED_IN event. Idempotent: once DONE it does nothing.
 */
import { completeTask, loadJourneyByStarter, recordEvent } from "./journey-service";

export const GUEST_SIGN_IN_KEY = "guest-sign-in";

/** Returns true when the task was completed by this call. Never throws: sign-in must not fail because of it. */
export async function completeGuestSignIn(starterId: string): Promise<boolean> {
  try {
    const journey = await loadJourneyByStarter(starterId);
    if (!journey || journey.status !== "active") return false;
    const task = journey.tasks.find((t) => t.key === GUEST_SIGN_IN_KEY);
    if (!task || !task.applicable || task.status === "DONE" || task.status === "LOCKED") return false;
    await completeTask(journey.id, GUEST_SIGN_IN_KEY, { actorId: starterId, evidence: "entra-sign-in" });
    await recordEvent({ journeyId: journey.id, actorId: starterId, type: "GUEST_SIGNED_IN", entity: "Task", entityId: task.id, data: { via: "entra" } });
    return true;
  } catch (e) {
    console.error("[guest-sign-in]", e);
    return false;
  }
}
