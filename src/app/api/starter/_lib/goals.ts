import { canManageJourney, type JourneyRef } from "@/lib/auth/access";
import type { SessionUser } from "@/lib/auth/roles";
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
