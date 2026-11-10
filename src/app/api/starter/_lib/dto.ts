import { isVettingFailed, stageDone, vettingInvited } from "@/domain/engine";
import { stageUnlockDate } from "@/domain/stage-timing";
import { formatLongDate } from "@/components/journey/format";
import { stageIndex, type JourneyState, type TaskState } from "@/domain/types";
import { getAdapter } from "@/adapters/registry";
import { STAGE_META, tallyStages } from "@/components/journey/derive";
import type { FirstAdvantageSummary, JourneyDto, PersonDto, TaskDto, ViewerRelation } from "@/components/journey/types";
import { canActOnTask, taskVisibleInScope, viewScope, type ViewScope } from "@/lib/auth/access";
import { hasAnyRole, parseRoles, type SessionUser } from "@/lib/auth/roles";
import { prisma } from "@/server/db";
import { STAGES } from "@/domain/types";

type UserRow = Awaited<ReturnType<typeof prisma.user.findMany>>[number];

export const toPerson = (u: UserRow): PersonDto => ({
  id: u.id,
  name: u.displayName,
  upn: u.upn,
  photoUrl: u.photoUrl,
  jobTitle: u.jobTitle,
  teamRole: u.teamRole,
  bio: u.bio,
});

/** F7: placeholder P&P phone number (synthetic). */
export const PNP_PHONE = "0800 000 0000 (example)";

/** Plain-words reason a task is locked. For starters, hidden (manager, buddy, P&P) steps are summarised, never named. */
export function lockedReason(j: JourneyState, t: TaskState, scope: ViewScope = "FULL", now: Date = new Date()): string | null {
  if (t.status !== "LOCKED") return null;
  const at = stageIndex(j.currentStage);
  if (stageIndex(t.stage) > at) {
    const prev = STAGES[stageIndex(t.stage) - 1];
    // D31: Day 0 and Day 30 also wait for their date, even when every task is done.
    const unlock = stageUnlockDate(j.startDate, t.stage);
    if (unlock && unlock.getTime() > now.getTime()) {
      const on = formatLongDate(unlock.toISOString());
      return stageDone(j, j.currentStage) && stageIndex(t.stage) === at + 1
        ? `Unlocks on ${on}.`
        : `Unlocks when ${STAGE_META[prev].label} tasks are done, and not before ${on}.`;
    }
    return `Unlocks when ${STAGE_META[prev].label} tasks are done.`;
  }
  const waiting = t.dependsOn
    .map((k) => j.tasks.find((x) => x.key === k))
    .filter((d): d is TaskState => !!d && d.applicable && d.status !== "DONE" && !d.optional);
  if (waiting.length) {
    if (scope === "STARTER") {
      if (t.key === "confirm-day-0-arrangements") return "Your line manager will share your first-day details here.";
      const shown = waiting.filter((d) => d.owner === "STARTER" || d.owner === "SYSTEM").map((d) => d.title);
      const hidden = waiting.filter((d) => d.owner !== "STARTER" && d.owner !== "SYSTEM");
      const extra = hidden.length ? (hidden.some((d) => d.owner === "LM") ? "your line manager" : "your team") : null;
      return `Waiting for: ${[...shown, ...(extra ? [extra] : [])].join(", ")}`;
    }
    return `Waiting for: ${waiting.map((d) => d.title).join(", ")}`;
  }
  return "Waiting for an earlier step.";
}

export function toTaskDto(j: JourneyState, t: TaskState, user: SessionUser): TaskDto {
  const scope = viewScope(user, j);
  return {
    id: t.id,
    key: t.key,
    title: t.title,
    description: t.description,
    stage: t.stage,
    owner: t.owner,
    type: t.type,
    status: t.status,
    dueDate: t.dueDate.toISOString(),
    completedAt: t.completedAt?.toISOString() ?? null,
    blockedReason: t.blockedReason,
    dependsOn: t.dependsOn,
    gating: t.gating,
    optional: !!t.optional,
    autoCompleteOnOpen: !!t.autoCompleteOnOpen,
    contentSlug: t.contentSlug,
    adapterKey: t.adapterKey,
    source: t.source,
    canAct: j.status === "active" && canActOnTask(user, j, t.owner, t.key, t.adapterKey) && !(scope === "STARTER" && isVettingFailed(j)),
    applicable: t.applicable,
    lockedReason: lockedReason(j, t, scope),
  };
}

export const relationOf = (user: SessionUser, j: JourneyState): ViewerRelation => {
  if (j.starterId === user.id) return "STARTER";
  if (j.buddyId === user.id) return "BUDDY";
  if (j.lmId === user.id) return "LM";
  if (hasAnyRole(user, "PNP")) return "PNP";
  if (hasAnyRole(user, "ADMIN")) return "ADMIN";
  return "OTHER";
};

export async function pnpContact(): Promise<PersonDto | null> {
  const all = await prisma.user.findMany({ orderBy: { displayName: "asc" } });
  const pnp = all.filter((u) => parseRoles(u.roles).includes("PNP"));
  const lead = pnp.find((u) => /lead/i.test(u.jobTitle ?? "")) ?? pnp[0];
  return lead ? toPerson(lead) : null;
}

export async function firstAdvantageSummary(journeyId: string): Promise<FirstAdvantageSummary | null> {
  try {
    const hv = await getAdapter("firstadvantage");
    return await hv.getVettingStatus(journeyId);
  } catch {
    return null;
  }
}

export async function buildJourneyDto(j: JourneyState, user: SessionUser): Promise<JourneyDto> {
  const ids = [j.starterId, j.lmId, ...(j.buddyId ? [j.buddyId] : [])];
  const people = await prisma.user.findMany({ where: { id: { in: ids } } });
  const get = (id: string) => {
    const u = people.find((p) => p.id === id);
    if (!u) throw new Error(`User ${id} missing`);
    return toPerson(u);
  };
  const scope = viewScope(user, j);
  const vettingBlocked = scope === "STARTER" && isVettingFailed(j);
  const [pnp, faSummary] = await Promise.all([pnpContact(), firstAdvantageSummary(j.id)]);
  // D32: no First Advantage status until the colleague has been invited to complete PEV (the UI shows only timing).
  const firstadvantage = vettingInvited(j, faSummary?.status) ? faSummary : null;
  return {
    id: j.id,
    status: j.status,
    currentStage: j.currentStage,
    startDate: j.startDate.toISOString(),
    flagged: j.flagged,
    flagReason: j.flagReason,
    starter: get(j.starterId),
    lm: get(j.lmId),
    buddy: j.buddyId ? get(j.buddyId) : null,
    pnp,
    viewerRelation: relationOf(user, j),
    viewerIsStarter: j.starterId === user.id,
    tasks: vettingBlocked ? [] : j.tasks.filter((t) => t.applicable && taskVisibleInScope(scope, user, j, t)).map((t) => toTaskDto(j, t, user)),
    firstadvantage,
    overall: tallyStages(j.tasks),
    vettingFailed: vettingBlocked,
    pnpPhone: PNP_PHONE,
  };
}
