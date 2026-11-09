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
 *  - F10: IT request tasks (LM-owned, `itrequest` adapter) can also be completed by the journey's buddy (pass `adapterKey`).
 *  - D12: `photo-check-override` is PNP-owned, but the journey's LM may complete it too (pass `taskKey`).
 */
export const PHOTO_OVERRIDE_TASK_KEY = "photo-check-override";

export const IT_REQUEST_ADAPTER_KEY = "itrequest";

export function canActOnTask(user: Pick<SessionUser, "id" | "roles">, j: JourneyRef, owner: Owner, taskKey?: string, adapterKey?: string | null): boolean {
  if (hasAnyRole(user, "PNP", "ADMIN")) return true;
  if (taskKey === PHOTO_OVERRIDE_TASK_KEY) return hasAnyRole(user, "LM") && j.lmId === user.id;
  if (owner === "SYSTEM" || owner === "PNP") return false;
  if (hasAnyRole(user, "LM") && j.lmId === user.id && (owner === "LM" || owner === "STARTER" || owner === "BUDDY")) return true;
  if (hasAnyRole(user, "STARTER") && j.starterId === user.id && owner === "STARTER") return true;
  if (hasAnyRole(user, "BUDDY") && j.buddyId === user.id && (owner === "BUDDY" || (owner === "LM" && adapterKey === IT_REQUEST_ADAPTER_KEY))) return true;
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

/**
 * How much of a journey the viewer sees (D20, D22):
 *  - FULL: PNP/ADMIN and the journey's LM (every task).
 *  - STARTER: the starter's own tasks plus SYSTEM status rows. LM, BUDDY and PNP tasks are hidden.
 *  - BUDDY: only the tasks the buddy can act on (their BUDDY tasks, plus IT requests). No starter task detail.
 */
export type ViewScope = "FULL" | "STARTER" | "BUDDY";

export function viewScope(user: Pick<SessionUser, "id" | "roles">, j: JourneyRef): ViewScope {
  if (canManageJourney(user, j)) return "FULL";
  if (j.starterId === user.id) return "STARTER";
  if (j.buddyId === user.id) return "BUDDY";
  return "FULL";
}

export function taskVisibleInScope(
  scope: ViewScope,
  user: Pick<SessionUser, "id" | "roles">,
  j: JourneyRef,
  t: { owner: Owner; key: string; adapterKey?: string | null },
): boolean {
  if (scope === "FULL") return true;
  if (scope === "STARTER") return t.owner === "STARTER" || t.owner === "SYSTEM";
  return canActOnTask(user, j, t.owner, t.key, t.adapterKey);
}
