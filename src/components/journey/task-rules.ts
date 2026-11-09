/** Shared (client + server) rules about how a task may be completed. Pure. */
import type { TaskDto } from "./types";

type RuleTask = Pick<TaskDto, "type" | "key" | "adapterKey" | "status" | "canAct">;

/** Tasks that complete only through their own flow (booking, order, photo, Day 0 confirmation). */
export function requiresFlow(t: Pick<TaskDto, "type" | "key">): boolean {
  return t.type === "BOOKING" || t.type === "ORDER" || t.key === "upload-pass-photo" || t.key === "confirm-day-0-arrangements";
}

/** One-tap "Mark done" is offered only for plain read/do tasks with nothing to submit. */
export function canQuickComplete(t: RuleTask): boolean {
  if (!t.canAct) return false;
  if (t.status !== "TODO" && t.status !== "IN_PROGRESS") return false;
  if (requiresFlow(t)) return false;
  return t.type === "INFO" || (t.type === "ACTION" && !t.adapterKey);
}
