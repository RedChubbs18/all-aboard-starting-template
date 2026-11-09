import type { Prisma } from "@prisma/client";
import type { Owner } from "@/domain/types";
import { hasAnyRole, type SessionUser } from "./roles";

export interface JourneyRef {
  starterId: string;
  lmId: string;
  buddyId: string | null;
}

/**
 * Journey visibility:
 *  - PNP / ADMIN: all journeys.
 *  - LM: only journeys where lmId = self.
 *  - BUDDY: only the journey they are allocated to (read-only).
 *  - STARTER: only their own journey.
 * A user holding several roles gets the union.
 */
export function canViewJourney(user: Pick<SessionUser, "id" | "roles">, j: JourneyRef): boolean {
  if (hasAnyRole(user, "PNP", "ADMIN")) return true;
  return (
    (hasAnyRole(user, "LM") && j.lmId === user.id) ||
    (hasAnyRole(user, "BUDDY") && j.buddyId === user.id) ||
    (hasAnyRole(user, "STARTER") && j.starterId === user.id)
  );
}

/** Journey-level writes (add bespoke task, buddy, Day 0, check-ins, exit). Buddies are read-only. */
export function canManageJourney(user: Pick<SessionUser, "id" | "roles">, j: JourneyRef): boolean {
  if (hasAnyRole(user, "PNP", "ADMIN")) return true;
  return hasAnyRole(user, "LM") && j.lmId === user.id;
}

/**
 * Task-level actions by owner:
 *  - PNP/ADMIN: any task. LM of the journey: LM, STARTER, BUDDY tasks.
 *  - STARTER: own journey's STARTER tasks. BUDDY: BUDDY-owned tasks on their starter only
 *    (e.g. "say hello"); everything else about the starter is read-only.
 *  - SYSTEM tasks change only through integrations (applyIntegrationStatus), except PNP/ADMIN.
 */
export function canActOnTask(user: Pick<SessionUser, "id" | "roles">, j: JourneyRef, owner: Owner): boolean {
  if (hasAnyRole(user, "PNP", "ADMIN")) return true;
  if (owner === "SYSTEM" || owner === "PNP") return false;
  if (hasAnyRole(user, "LM") && j.lmId === user.id && (owner === "LM" || owner === "STARTER" || owner === "BUDDY")) return true;
  if (hasAnyRole(user, "STARTER") && j.starterId === user.id && owner === "STARTER") return true;
  if (hasAnyRole(user, "BUDDY") && j.buddyId === user.id && owner === "BUDDY") return true;
  return false;
}

/** Prisma `where` for journey list queries, enforcing the visibility rules above. */
export function journeyScopeWhere(user: Pick<SessionUser, "id" | "roles">): Prisma.JourneyWhereInput {
  if (hasAnyRole(user, "PNP", "ADMIN")) return {};
  const or: Prisma.JourneyWhereInput[] = [];
  if (hasAnyRole(user, "LM")) or.push({ lmId: user.id });
  if (hasAnyRole(user, "BUDDY")) or.push({ buddyId: user.id });
  if (hasAnyRole(user, "STARTER")) or.push({ starterId: user.id });
  return or.length ? { OR: or } : { id: "__none__" };
}
