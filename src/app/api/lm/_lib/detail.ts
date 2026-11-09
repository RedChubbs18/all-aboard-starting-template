/** Builds the LM-facing DTOs. Read-only: all writes go through journey-service. */
import { normalizeIntegrationStatus } from "@/domain/engine";
import type { JourneyState } from "@/domain/types";
import { PHOTO_OVERRIDE_TASK_KEY, canActOnTask } from "@/lib/auth/access";
import type { SessionUser } from "@/lib/auth/roles";
import { chatLink } from "@/lib/teams";
import { prisma } from "@/server/db";
import { computeProgress, loadJourney } from "@/server/journey-service";
import type { FirstAdvantageState, Person, StarterDetail, StarterSummary, TaskDto } from "@/components/lm/types";
import { HttpError } from "./guard";

const iso = (d: Date) => d.toISOString();

export const PHOTO_OVERRIDE_KEY = PHOTO_OVERRIDE_TASK_KEY;

const stringList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length ? v.filter((x): x is string => typeof x === "string") : null;

/**
 * Issues from the latest failed photo check: the photocheck IntegrationState payload, else the
 * newest event carrying `data.issues`. The image itself is never stored, only these messages.
 */
async function latestPhotoIssues(journeyId: string): Promise<string[]> {
  const state = await prisma.integrationState.findUnique({ where: { journeyId_adapterKey: { journeyId, adapterKey: "photocheck" } } });
  const fromState = stringList((state?.payload as { issues?: unknown } | null)?.issues);
  if (fromState) return fromState;
  const events = await prisma.event.findMany({ where: { journeyId, type: { contains: "PHOTO" } }, orderBy: { createdAt: "desc" }, take: 10 });
  for (const e of events) {
    const found = stringList((e.data as { issues?: unknown } | null)?.issues);
    if (found) return found;
  }
  return [];
}

export async function firstAdvantageStates(journeyIds: string[]): Promise<Map<string, FirstAdvantageState>> {
  const rows = await prisma.integrationState.findMany({ where: { adapterKey: "firstadvantage", journeyId: { in: journeyIds } } });
  return new Map(rows.map((r) => [r.journeyId, normalizeIntegrationStatus(r.status)]));
}

const isRed = (h: FirstAdvantageState | null | undefined) => h === "ACTION_NEEDED" || h === "FAILED";

export async function buildSummaries(journeys: JourneyState[], now = new Date()): Promise<StarterSummary[]> {
  const people = await prisma.user.findMany({ where: { id: { in: journeys.map((j) => j.starterId) } }, select: { id: true, displayName: true } });
  const hv = await firstAdvantageStates(journeys.map((j) => j.id));
  const out = journeys.map((j): StarterSummary => {
    const p = computeProgress(j, now);
    const h = hv.get(j.id) ?? null;
    const redFlag = isRed(h);
    const next = p.nextDue[0];
    return {
      id: j.id,
      starterName: people.find((x) => x.id === j.starterId)?.displayName ?? "Unknown starter",
      startDate: iso(j.startDate),
      stage: j.currentStage,
      status: j.status,
      percent: p.percent,
      overdue: p.overdue.length,
      overdueLm: p.overdue.filter((t) => t.owner === "LM").length,
      blocked: p.blocked.length,
      firstadvantage: h,
      redFlag,
      needsAttention: redFlag || j.flagged || p.overdue.length > 0 || p.blocked.length > 0,
      nextDue: next ? { title: next.title, dueDate: iso(next.dueDate) } : null,
    };
  });
  // Needs attention first: red flags, then overdue (LM-owned first), then blocked, then soonest start.
  return out.sort(
    (a, b) =>
      Number(b.redFlag) - Number(a.redFlag) ||
      Number(b.needsAttention) - Number(a.needsAttention) ||
      b.overdueLm - a.overdueLm ||
      b.overdue - a.overdue ||
      b.blocked - a.blocked ||
      a.startDate.localeCompare(b.startDate),
  );
}

const person = (u: { id: string; displayName: string; upn: string; jobTitle: string | null }): Person => ({
  id: u.id,
  displayName: u.displayName,
  upn: u.upn,
  jobTitle: u.jobTitle,
  chatUrl: chatLink(u.upn),
});

export async function buildDetail(journeyId: string, user: SessionUser, now = new Date()): Promise<StarterDetail> {
  const j = await loadJourney(journeyId);
  if (!j) throw new HttpError(404, "not_found", "Starter not found");
  const [starter, lm, buddy, candidates, checkIns, goals, day0, hv] = await Promise.all([
    prisma.user.findUnique({ where: { id: j.starterId } }),
    prisma.user.findUnique({ where: { id: j.lmId } }),
    j.buddyId ? prisma.user.findUnique({ where: { id: j.buddyId } }) : null,
    prisma.user.findMany({
      where: { teamId: j.teamId, buddyEligible: true, id: { notIn: [j.lmId, j.starterId] } },
      orderBy: { displayName: "asc" },
    }),
    prisma.checkIn.findMany({ where: { journeyId }, orderBy: { scheduledAt: "desc" } }),
    prisma.goal.findMany({ where: { journeyId }, orderBy: { id: "asc" } }),
    prisma.day0Arrangement.findUnique({ where: { journeyId } }),
    firstAdvantageStates([journeyId]),
  ]);
  if (!starter || !lm) throw new HttpError(404, "not_found", "Starter not found");

  const p = computeProgress(j, now);
  const live = j.tasks.filter((t) => t.applicable);
  const byKey = new Map(live.map((t) => [t.key, t]));
  const overdueIds = new Set(p.overdue.map((t) => t.id));
  const tasks: TaskDto[] = live.map((t) => ({
    id: t.id,
    key: t.key,
    title: t.title,
    description: t.description,
    stage: t.stage,
    owner: t.owner,
    type: t.type,
    status: t.status,
    source: t.source,
    dueDate: iso(t.dueDate),
    completedAt: t.completedAt ? iso(t.completedAt) : null,
    blockedReason: t.blockedReason,
    evidence: t.evidence,
    overdue: overdueIds.has(t.id),
    waitingFor:
      t.status === "LOCKED"
        ? t.dependsOn.map((k) => byKey.get(k)).filter((d) => d && d.status !== "DONE").map((d) => d!.title)
        : [],
    canAct: j.status === "active" && t.owner === "LM" && t.status !== "LOCKED" && canActOnTask(user, j, t.owner),
  }));
  const h = hv.get(journeyId) ?? null;
  const overrideTask = tasks.find((t) => t.key === PHOTO_OVERRIDE_KEY);
  const photoReview =
    overrideTask && overrideTask.status !== "DONE"
      ? { taskKey: overrideTask.key, issues: await latestPhotoIssues(journeyId) }
      : null;
  return {
    journey: {
      id: j.id,
      stage: j.currentStage,
      status: j.status,
      startDate: iso(j.startDate),
      flagged: j.flagged,
      flagReason: j.flagReason,
      firstadvantage: h,
      redFlag: isRed(h),
    },
    starter: person(starter),
    lm: person(lm),
    buddy: buddy ? person(buddy) : null,
    buddyCandidates: candidates.map((c) => ({ id: c.id, displayName: c.displayName, upn: c.upn, jobTitle: c.jobTitle })),
    progress: {
      percent: p.percent,
      total: p.total,
      done: p.done,
      overdue: p.overdue.length,
      blocked: p.blocked.length,
      perStage: p.perStage,
    },
    tasks,
    photoReview,
    checkIns: checkIns.map((c) => ({ id: c.id, cadence: c.cadence, scheduledAt: iso(c.scheduledAt), meetingLink: c.meetingLink })),
    goals: goals.map((g) => ({ id: g.id, horizon: g.horizon as StarterDetail["goals"][number]["horizon"], text: g.text, done: g.done })),
    day0: day0 ? { where: day0.where, whenAt: iso(day0.whenAt), who: day0.who, confirmedAt: day0.confirmedAt ? iso(day0.confirmedAt) : null } : null,
  };
}
