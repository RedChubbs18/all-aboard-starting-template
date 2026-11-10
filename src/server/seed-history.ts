/**
 * Synthetic history for the MI dashboards (seed only). Journeys in content/seed/people.json may carry a
 * `history` block; this module turns it into back-dated stage changes, task completions, First Advantage
 * events and chase nudges so the MI sections have six months of believable data. Pure helpers plus one
 * writer; nothing here runs outside the seed.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { SeedJourney, SeedPeople } from "@/domain/seed-schema";
import { STAGES, stageIndex, type NewEvent, type TaskState } from "@/domain/types";

const DAY = 86_400_000;
const HOUR = 3_600_000;

type History = NonNullable<SeedJourney["history"]>;

/** Midnight UTC by default, so a stage entered on the start date is not "after" a due date set to the same day. */
export const at = (date: string, hours = 0): Date => new Date(Date.parse(date) + hours * HOUR);

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Stage entry times: index 0 is the journey creation. */
export function stageEntries(h: History, base: Date, upTo: number): Date[] {
  const out: Date[] = [base];
  for (let i = 1; i <= upTo; i++) {
    const given = h.stageEnteredAt[STAGES[i]];
    out.push(given ? at(given) : new Date(out[i - 1].getTime() + 4 * DAY));
  }
  return out;
}

/** Days an LM completes a task after its due date: 0 about half the time, up to `delay` otherwise. Deterministic. */
export function lmLateness(journeyKey: string, taskKey: string, delay: number): number {
  if (delay <= 0) return 0;
  return Math.max(0, (hash(`${journeyKey}|${taskKey}`) % (2 * delay + 1)) - delay);
}

export interface DoneAtCtx {
  journeyKey: string;
  now: Date;
  entries: Date[];
  /** Currently reached stage index. */
  k: number;
  /** End of the journey for activity purposes: min(now, exit or completion date). */
  endAt: Date;
}

/**
 * Completion time for a DONE task: its due date, kept inside the window of the stage it belongs to (so a starter's
 * last activity is never older than their current stage) and never after now. LM tasks may run late by the journey's
 * `lmDelayDays`; starter tasks stop at `lastStarterActivityAt`.
 */
export function doneAtFor(h: History | null | undefined, t: TaskState, c: DoneAtCtx): Date {
  // Journeys without a history block keep the original rule (due date, capped at now).
  if (!h) return new Date(Math.min(c.now.getTime(), t.dueDate.getTime()));
  const si = Math.min(stageIndex(t.stage), c.k);
  const start = c.entries[si] ?? c.entries[0];
  const left = si < c.k ? c.entries[si + 1] : c.endAt;
  let ms: number;
  if (t.owner === "LM") {
    ms = t.dueDate.getTime() + lmLateness(c.journeyKey, t.key, h.lmDelayDays) * DAY;
    ms = Math.min(ms, c.endAt.getTime());
  } else {
    ms = Math.min(t.dueDate.getTime(), left.getTime() - 6 * HOUR);
  }
  ms = Math.max(ms, start.getTime());
  if (t.owner === "STARTER" && h.lastStarterActivityAt) ms = Math.min(ms, at(h.lastStarterActivityAt).getTime());
  return new Date(Math.min(ms, c.now.getTime()));
}

/** Audit events for every DONE task, attributed to the owner role, so "last starter activity" has a source. */
export function taskDoneEvents(
  journeyId: string,
  tasks: TaskState[],
  actors: { starter: string; lm: string; buddy: string | null; pnp: string | null },
  /** When the audit event happened; defaults to the task's completion time. */
  eventAt: (t: TaskState) => Date = (t) => t.completedAt as Date,
): NewEvent[] {
  const out: NewEvent[] = [];
  for (const t of tasks) {
    if (t.status !== "DONE" || !t.completedAt) continue;
    const actorId = t.owner === "STARTER" ? actors.starter : t.owner === "LM" ? actors.lm : t.owner === "BUDDY" ? actors.buddy : t.owner === "PNP" ? actors.pnp : null;
    out.push({ journeyId, actorId, type: "TASK_STATUS_CHANGED", entity: "Task", entityId: t.id, from: "TODO", to: "DONE", data: { key: t.key, blockedReason: null }, createdAt: eventAt(t) });
  }
  return out;
}

/** First Advantage timeline as the INTEGRATION_STATUS events the engine would have written. */
export function vettingEvents(journeyId: string, h: History): NewEvent[] {
  const v = h.vetting;
  if (!v) return [];
  const mk = (when: string, status: string, normalized: string): NewEvent => ({
    journeyId, actorId: null, type: "INTEGRATION_STATUS", entity: "Integration", entityId: "firstadvantage",
    from: null, to: status, data: { normalized, simulated: true }, createdAt: at(when, 11),
  });
  const out: NewEvent[] = [];
  if (v.actionNeededAt) out.push(mk(v.actionNeededAt, "action_needed", "ACTION_NEEDED"));
  if (v.actionResolvedAt) out.push(mk(v.actionResolvedAt, "in_progress", "IN_PROGRESS"));
  if (v.clearedAt) out.push(mk(v.clearedAt, "cleared", "COMPLETE"));
  return out;
}

/** Chase history (relative to the seed time so the 24h suppression stays predictable): days ago, per LM. */
export const SEED_CHASES: Record<string, number[]> = {
  "owen-placeholder": [2, 5, 9, 16],
  "marcus-testwell": [3, 7],
  "harriet-demo": [6],
};

export async function seedChases(prisma: PrismaClient, people: SeedPeople, now: Date) {
  const keys = new Set(people.users.map((u) => u.key));
  const actor = keys.has("imogen-sample") ? "imogen-sample" : null;
  const data: Prisma.EventCreateManyInput[] = [];
  for (const [lmId, ago] of Object.entries(SEED_CHASES)) {
    if (!keys.has(lmId)) continue;
    for (const d of ago) {
      data.push({
        journeyId: null, actorId: actor, type: "NUDGE_SENT", entity: "User", entityId: lmId,
        data: { kind: "CHASE_LM", tasks: [], seeded: true } as Prisma.InputJsonValue,
        createdAt: new Date(now.getTime() - d * DAY - 2 * HOUR),
      });
    }
  }
  if (data.length) await prisma.event.createMany({ data });
  return data.length;
}
