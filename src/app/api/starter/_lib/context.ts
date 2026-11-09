import { canActOnTask, canViewJourney, journeyScopeWhere } from "@/lib/auth/access";
import { hasAnyRole, type SessionUser } from "@/lib/auth/roles";
import { prisma } from "@/server/db";
import { listJourneys, loadJourney, loadJourneyByStarter } from "@/server/journey-service";
import type { JourneyState, TaskState } from "@/domain/types";
import { HttpError } from "./http";

/** The journey the viewer asked for (must be visible to them), or their default one. */
export async function resolveJourney(user: SessionUser, journeyId: string | null): Promise<JourneyState> {
  if (journeyId) {
    const j = await loadJourney(journeyId);
    if (!j) throw new HttpError(404, "not_found", "Journey not found");
    if (!canViewJourney(user, j)) throw new HttpError(403, "forbidden", "You cannot view this journey");
    return j;
  }
  if (hasAnyRole(user, "STARTER")) {
    const own = await loadJourneyByStarter(user.id);
    if (own) return own;
  }
  const list = await listJourneys(journeyScopeWhere(user));
  const pick = list.find((j) => j.status === "active") ?? list[0];
  if (!pick) throw new HttpError(404, "no_journey", "There is no journey for you to view yet");
  return pick;
}

/** Other journeys the viewer can switch to (never includes the one in view). */
export async function otherJourneys(user: SessionUser, current: JourneyState) {
  if (hasAnyRole(user, "STARTER") && current.starterId === user.id && !hasAnyRole(user, "LM", "PNP", "ADMIN", "BUDDY")) return [];
  const list = await listJourneys(journeyScopeWhere(user));
  const people = await prisma.user.findMany({ where: { id: { in: list.map((j) => j.starterId) } }, select: { id: true, displayName: true } });
  return list
    .filter((j) => j.id !== current.id)
    .map((j) => ({ id: j.id, starterName: people.find((p) => p.id === j.starterId)?.displayName ?? "Starter", stage: j.currentStage }));
}

export async function taskContext(user: SessionUser, taskId: string): Promise<{ journey: JourneyState; task: TaskState }> {
  const row = await prisma.task.findUnique({ where: { id: taskId }, select: { journeyId: true } });
  if (!row) throw new HttpError(404, "not_found", "Task not found");
  const journey = await loadJourney(row.journeyId);
  if (!journey) throw new HttpError(404, "not_found", "Journey not found");
  if (!canViewJourney(user, journey)) throw new HttpError(403, "forbidden", "You cannot view this task");
  const task = journey.tasks.find((t) => t.id === taskId);
  if (!task || !task.applicable) throw new HttpError(404, "not_found", "Task not found");
  return { journey, task };
}

/** Writes need ownership of the task and an active journey. */
export function assertCanAct(user: SessionUser, journey: JourneyState, task: TaskState) {
  if (journey.status !== "active") throw new HttpError(409, "journey_closed", `This journey is ${journey.status}`);
  if (!canActOnTask(user, journey, task.owner)) throw new HttpError(403, "forbidden", "You cannot change this task");
}

export function findByKey(journey: JourneyState, key: string): TaskState | undefined {
  return journey.tasks.find((t) => t.key === key && t.applicable);
}
