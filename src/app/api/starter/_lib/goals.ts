import { canManageJourney, type JourneyRef } from "@/lib/auth/access";
import type { SessionUser } from "@/lib/auth/roles";
import { isStageTimeReached } from "@/domain/stage-timing";
import type { GoalHorizon } from "@/domain/types";

export interface GoalDto {
  id: string;
  horizon: GoalHorizon;
  text: string;
  done: boolean;
  authorId: string | null;
}

/** Who may edit goals: the starter (30/60/90) and managers of the journey. Buddies are read-only. */
export const canEditGoals = (user: Pick<SessionUser, "id" | "roles">, j: JourneyRef) => j.starterId === user.id || canManageJourney(user, j);

/**
 * D21 / F8: before the journey's start date the starter's goals are read-only (lock icons in the UI).
 * Managers (the LM, P&P, admin) can still edit. Returns the start date (ISO) while locked, else null.
 */
export function goalsLockedUntil(user: Pick<SessionUser, "id" | "roles">, j: JourneyRef & { startDate: Date }, now: Date = new Date()): string | null {
  if (canManageJourney(user, j) || j.starterId !== user.id) return null;
  return isStageTimeReached(j.startDate, "DAY_0", now) ? null : j.startDate.toISOString(); // same rule as the Day 0 stage (D31)
}
