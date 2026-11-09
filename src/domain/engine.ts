import { randomUUID } from "node:crypto";
import { isExitReason } from "./exit-reasons";
import {
  STAGES,
  stageIndex,
  type Ctx,
  type EngineResult,
  type JourneyState,
  type NewEvent,
  type Owner,
  type Stage,
  type TaskState,
  type TaskStatus,
  type TemplateInput,
} from "./types";

const DAY_MS = 86_400_000;

/**
 * D13: the offer-to-start gap can be up to 3 months, so computed due dates are clamped so that
 * none falls before the journey creation date plus this many days.
 */
export const MIN_DUE_GRACE_DAYS = 2;

/** Due date = start date + offset, but never earlier than `createdAt` + MIN_DUE_GRACE_DAYS. */
export function computeDueDate(startDate: Date, offsetDays: number, createdAt: Date, graceDays = MIN_DUE_GRACE_DAYS): Date {
  const due = addDays(startDate, offsetDays);
  const floor = addDays(createdAt, graceDays);
  return due.getTime() < floor.getTime() ? floor : due;
}

export class EngineError extends Error {}

const nowOf = (ctx?: Ctx) => ctx?.now ?? new Date();

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function ev(
  journey: Pick<JourneyState, "id">,
  ctx: Ctx | undefined,
  e: Omit<NewEvent, "journeyId" | "actorId" | "createdAt" | "data"> & { data?: Record<string, unknown> | null },
): NewEvent {
  return {
    journeyId: journey.id,
    actorId: ctx?.actorId ?? null,
    createdAt: nowOf(ctx),
    data: null,
    ...e,
  };
}

// ---------------------------------------------------------------- conditions

/**
 * Some tasks can be satisfied by another one. A P&P "photo-check-override" task, once DONE,
 * satisfies "photo-check-passed" (FR-3.12 manual override), so it no longer blocks
 * dependants, stage gating or the journey flag.
 */
export const SATISFIED_BY: Record<string, string[]> = {
  "photo-check-passed": ["photo-check-override"],
};

/** DONE, or satisfied by an override task that is DONE. */
export function isEffectivelyDone(t: TaskState, tasks: TaskState[]): boolean {
  if (t.status === "DONE") return true;
  const by = SATISFIED_BY[t.key];
  return !!by && tasks.some((x) => by.includes(x.key) && x.status === "DONE");
}

const statusOf = (tasks: TaskState[], key: string) => tasks.find((t) => t.key === key)?.status;

/** Named conditions used by seeded templates (content/seed/templates.json). */
const NAMED_CONDITIONS: Record<string, (tasks: TaskState[]) => boolean> = {
  // FR-4.5: only when the induction has not been booked.
  "induction-not-booked": (tasks) => statusOf(tasks, "book-induction") !== "DONE",
  // FR-2.2: reminders only while PEV steps are incomplete.
  "pev-steps-incomplete": (tasks) => statusOf(tasks, "complete-vetting-steps") !== "DONE",
  // FR-3.12: P&P override only offered once the photo check has failed (task BLOCKED).
  "photo-check-failed": (tasks) => statusOf(tasks, "photo-check-passed") === "BLOCKED",
};

/**
 * Supported forms: a named condition above, `done:KEY`, or `notDone:KEY`.
 * Unknown/malformed conditions are treated as applicable (fail open, never hide work).
 */
export function evaluateCondition(condition: string | null | undefined, tasks: TaskState[]): boolean {
  if (!condition) return true;
  const c = condition.trim();
  const named = NAMED_CONDITIONS[c];
  if (named) return named(tasks);
  const m = /^(done|notDone):(.+)$/.exec(c);
  if (!m) return true;
  const [, kind, key] = m;
  const isDone = statusOf(tasks, key) === "DONE";
  return kind === "done" ? isDone : !isDone;
}

// ------------------------------------------------------------------ creation

export interface CreateJourneyOptions {
  id?: string;
  starterId: string;
  lmId: string;
  buddyId?: string | null;
  teamId: string;
  startDate: Date;
  now?: Date;
  actorId?: string | null;
  newId?: () => string;
}

export function taskFromTemplate(t: TemplateInput, startDate: Date, newId: () => string, createdAt: Date = new Date()): TaskState {
  return {
    id: newId(),
    templateId: t.id ?? null,
    key: t.key,
    title: t.title,
    description: t.description ?? "",
    stage: t.stage,
    owner: t.owner,
    type: t.type,
    status: "LOCKED",
    dueDate: computeDueDate(startDate, t.dueOffsetDays, createdAt),
    completedAt: null,
    blockedReason: null,
    evidence: null,
    dependsOn: [...t.dependsOn],
    source: t.source,
    adapterKey: t.adapterKey ?? null,
    gating: t.gating,
    contentSlug: t.contentSlug ?? null,
    condition: t.condition ?? null,
    applicable: true,
    sortOrder: t.sortOrder ?? 0,
  };
}

/** CORE templates always apply; TEAM templates only for the matching team; BESPOKE are never auto-applied. */
export function templatesFor(templates: TemplateInput[], teamId: string): TemplateInput[] {
  return templates.filter(
    (t) => t.source === "CORE" || (t.source === "TEAM" && t.teamId === teamId),
  );
}

export function createJourney(templates: TemplateInput[], opts: CreateJourneyOptions): EngineResult {
  const newId = opts.newId ?? randomUUID;
  const ctx: Ctx = { now: opts.now, actorId: opts.actorId };
  const selected = templatesFor(templates, opts.teamId);
  const keys = new Set<string>();
  for (const t of selected) {
    if (keys.has(t.key)) throw new EngineError(`Duplicate template key: ${t.key}`);
    keys.add(t.key);
  }
  const journey: JourneyState = {
    id: opts.id ?? newId(),
    starterId: opts.starterId,
    lmId: opts.lmId,
    buddyId: opts.buddyId ?? null,
    teamId: opts.teamId,
    startDate: opts.startDate,
    currentStage: STAGES[0],
    status: "active",
    exitReason: null,
    exitStage: null,
    completedAt: null,
    flagged: false,
    flagReason: null,
    tasks: selected.map((t) => taskFromTemplate(t, opts.startDate, newId, nowOf(ctx))),
  };
  const created = ev(journey, ctx, {
    type: "JOURNEY_CREATED",
    entity: "Journey",
    entityId: journey.id,
    from: null,
    to: journey.currentStage,
    data: { taskCount: journey.tasks.length, teamId: opts.teamId },
  });
  const r = settle(journey, ctx, { quiet: true });
  return { journey: r.journey, events: [created, ...r.events] };
}

// ----------------------------------------------------------------- recompute

/**
 * LOCKED when the task's stage is not reached or any applicable dependency is not DONE;
 * TODO otherwise. DONE is never downgraded; IN_PROGRESS and BLOCKED are left alone.
 * Dependencies on keys that are absent (e.g. another team's template) or not
 * applicable are treated as satisfied.
 */
export function recomputeTasks(journey: JourneyState, ctx?: Ctx): EngineResult {
  const events: NewEvent[] = [];
  const at = stageIndex(journey.currentStage);

  // Conditions first, using current statuses (statuses below never move to/from DONE).
  let tasks = journey.tasks.map((t) => {
    const applicable = evaluateCondition(t.condition, journey.tasks);
    if (applicable !== t.applicable) {
      events.push(
        ev(journey, ctx, {
          type: "TASK_APPLICABILITY_CHANGED",
          entity: "Task",
          entityId: t.id,
          from: String(t.applicable),
          to: String(applicable),
          data: { key: t.key },
        }),
      );
      return { ...t, applicable };
    }
    return t;
  });
  const applicableByKey = new Map(tasks.map((t) => [t.key, t]));

  tasks = tasks.map((t) => {
    if (t.status === "DONE" || t.status === "IN_PROGRESS" || t.status === "BLOCKED") return t;
    const stageReached = stageIndex(t.stage) <= at;
    const depsDone = t.dependsOn.every((k) => {
      const d = applicableByKey.get(k);
      return !d || !d.applicable || isEffectivelyDone(d, tasks);
    });
    const next: TaskStatus = stageReached && depsDone && t.applicable ? "TODO" : "LOCKED";
    if (next === t.status) return t;
    events.push(
      ev(journey, ctx, {
        type: "TASK_STATUS_CHANGED",
        entity: "Task",
        entityId: t.id,
        from: t.status,
        to: next,
        data: { key: t.key, reason: "recompute" },
      }),
    );
    return { ...t, status: next };
  });
  return { journey: { ...journey, tasks }, events };
}

// ------------------------------------------------------------------- stages

function stageDone(journey: JourneyState, stage: Stage): boolean {
  const gating = journey.tasks.filter((t) => t.stage === stage && t.gating && t.applicable);
  if (stage === STAGES[STAGES.length - 1] && gating.length === 0) return false;
  return gating.every((t) => isEffectivelyDone(t, journey.tasks));
}

function moveToStage(journey: JourneyState, to: Stage, ctx: Ctx | undefined, reason: string): EngineResult {
  const e = ev(journey, ctx, {
    type: "STAGE_CHANGED",
    entity: "Journey",
    entityId: journey.id,
    from: journey.currentStage,
    to,
    data: { reason },
  });
  const moved = { ...journey, currentStage: to };
  const r = recomputeTasks(moved, ctx);
  return { journey: r.journey, events: [e, ...r.events] };
}

/**
 * Advance while the current stage's gating tasks are all DONE. When all DAY_30
 * gating tasks are DONE the journey completes. No-op unless the journey is active.
 */
export function advanceStage(journey: JourneyState, ctx?: Ctx): EngineResult {
  let j = journey;
  const events: NewEvent[] = [];
  if (j.status !== "active") return { journey: j, events };
  for (let guard = 0; guard < STAGES.length + 1; guard++) {
    if (!stageDone(j, j.currentStage)) break;
    const idx = stageIndex(j.currentStage);
    if (idx === STAGES.length - 1) {
      j = { ...j, status: "completed", completedAt: nowOf(ctx) };
      events.push(
        ev(j, ctx, {
          type: "JOURNEY_COMPLETED",
          entity: "Journey",
          entityId: j.id,
          from: "active",
          to: "completed",
        }),
      );
      break;
    }
    const r = moveToStage(j, STAGES[idx + 1], ctx, "gating_tasks_done");
    j = r.journey;
    events.push(...r.events);
  }
  return { journey: j, events };
}

/** Flag = any applicable task is BLOCKED. Emits events only on change. */
export function refreshFlag(journey: JourneyState, ctx?: Ctx): EngineResult {
  const blocked = journey.tasks.find((t) => t.applicable && t.status === "BLOCKED" && !isEffectivelyDone(t, journey.tasks));
  const flagged = !!blocked;
  const reason = blocked ? (blocked.blockedReason ?? `${blocked.title} is blocked`) : null;
  if (flagged === journey.flagged && reason === journey.flagReason) return { journey, events: [] };
  const events: NewEvent[] =
    flagged !== journey.flagged
      ? [
          ev(journey, ctx, {
            type: flagged ? "JOURNEY_FLAGGED" : "JOURNEY_UNFLAGGED",
            entity: "Journey",
            entityId: journey.id,
            from: String(journey.flagged),
            to: String(flagged),
            data: { reason, taskKey: blocked?.key ?? null },
          }),
        ]
      : [];
  return { journey: { ...journey, flagged, flagReason: reason }, events };
}

/** recompute -> advance -> flag, repeated until stable. Used after every mutation. */
export function settle(journey: JourneyState, ctx?: Ctx, opts: { quiet?: boolean } = {}): EngineResult {
  let j = journey;
  const events: NewEvent[] = [];
  for (let i = 0; i < STAGES.length + 2; i++) {
    const r = recomputeTasks(j, ctx);
    const a = advanceStage(r.journey, ctx);
    const changed = r.events.length > 0 || a.events.length > 0;
    j = a.journey;
    // Initial-state unlocks at creation are not audit-worthy individually.
    if (!opts.quiet) events.push(...r.events);
    events.push(...a.events);
    if (!changed) break;
  }
  const f = refreshFlag(j, ctx);
  events.push(...f.events);
  return { journey: f.journey, events };
}

// -------------------------------------------------------------- task changes

function assertActive(j: JourneyState) {
  if (j.status !== "active") throw new EngineError(`Journey is ${j.status}`);
}

function findTask(j: JourneyState, key: string): TaskState {
  const t = j.tasks.find((x) => x.key === key);
  if (!t) throw new EngineError(`No task with key ${key}`);
  return t;
}

export interface SetStatusOptions extends Ctx {
  blockedReason?: string | null;
  evidence?: string | null;
}

const ALLOWED: Record<TaskStatus, TaskStatus[]> = {
  LOCKED: [],
  TODO: ["IN_PROGRESS", "BLOCKED", "DONE"],
  IN_PROGRESS: ["TODO", "BLOCKED", "DONE"],
  BLOCKED: ["TODO", "IN_PROGRESS", "DONE"],
  DONE: ["TODO"], // reopen
};

/** Manual status change (user or admin). LOCKED tasks cannot be changed; DONE can only be reopened to TODO. */
export function setTaskStatus(
  journey: JourneyState,
  key: string,
  status: TaskStatus,
  opts: SetStatusOptions = {},
): EngineResult {
  assertActive(journey);
  const t = findTask(journey, key);
  if (!t.applicable) throw new EngineError(`Task ${key} is not applicable`);
  if (t.status === status) return { journey, events: [] };
  if (!ALLOWED[t.status].includes(status)) {
    throw new EngineError(`Cannot move task ${key} from ${t.status} to ${status}`);
  }
  if (status === "BLOCKED" && !opts.blockedReason) {
    throw new EngineError("blockedReason is required when blocking a task");
  }
  const updated: TaskState = {
    ...t,
    status,
    completedAt: status === "DONE" ? nowOf(opts) : null,
    blockedReason: status === "BLOCKED" ? (opts.blockedReason ?? null) : null,
    evidence: opts.evidence !== undefined ? opts.evidence : t.evidence,
  };
  const base: JourneyState = { ...journey, tasks: journey.tasks.map((x) => (x.id === t.id ? updated : x)) };
  const e = ev(journey, opts, {
    type: "TASK_STATUS_CHANGED",
    entity: "Task",
    entityId: t.id,
    from: t.status,
    to: status,
    data: { key, blockedReason: updated.blockedReason },
  });
  const s = settle(base, opts);
  return { journey: s.journey, events: [e, ...s.events] };
}

export const completeTask = (j: JourneyState, key: string, opts: SetStatusOptions = {}) =>
  setTaskStatus(j, key, "DONE", opts);

export interface BespokeTaskInput {
  title: string;
  description?: string;
  stage: Stage;
  dueDate: Date;
  owner?: Owner;
  type?: TaskState["type"];
  dependsOn?: string[];
  gating?: boolean;
  key?: string;
}

/** FR-3.6: LM-added task. Appears immediately; never gating unless asked. */
export function addBespokeTask(
  journey: JourneyState,
  input: BespokeTaskInput,
  ctx: Ctx & { newId?: () => string } = {},
): EngineResult {
  assertActive(journey);
  const newId = ctx.newId ?? randomUUID;
  const id = newId();
  const key = input.key ?? `bespoke-${id.slice(0, 8)}`;
  if (journey.tasks.some((t) => t.key === key)) throw new EngineError(`Duplicate task key ${key}`);
  const task: TaskState = {
    id,
    templateId: null,
    key,
    title: input.title,
    description: input.description ?? "",
    stage: input.stage,
    owner: input.owner ?? "STARTER",
    type: input.type ?? "ACTION",
    status: "LOCKED",
    dueDate: input.dueDate,
    completedAt: null,
    blockedReason: null,
    evidence: null,
    dependsOn: input.dependsOn ?? [],
    source: "BESPOKE",
    adapterKey: null,
    gating: input.gating ?? false,
    contentSlug: null,
    condition: null,
    applicable: true,
    sortOrder: 1000,
  };
  const e = ev(journey, ctx, {
    type: "TASK_ADDED",
    entity: "Task",
    entityId: id,
    from: null,
    to: task.stage,
    data: { key, title: task.title, source: "BESPOKE" },
  });
  const s = settle({ ...journey, tasks: [...journey.tasks, task] }, ctx);
  return { journey: s.journey, events: [e, ...s.events] };
}

// ---------------------------------------------------------------- integrations

export type NormalizedIntegration = "NOT_STARTED" | "IN_PROGRESS" | "ACTION_NEEDED" | "COMPLETE" | "FAILED";

const COMPLETE = new Set(["cleared", "complete", "completed", "done", "ready", "created", "applied", "confirmed", "issued", "granted", "ordered", "booked", "available"]);
const FAILED = new Set(["failed", "error", "rejected"]);
const ACTION = new Set(["action_needed", "actionneeded", "action-needed", "blocked"]);
const PROGRESS = new Set(["in_progress", "inprogress", "pending", "requested", "invited", "submitted"]);

export function normalizeIntegrationStatus(status: string): NormalizedIntegration {
  const s = status.trim().toLowerCase();
  if (COMPLETE.has(s)) return "COMPLETE";
  if (FAILED.has(s)) return "FAILED";
  if (ACTION.has(s)) return "ACTION_NEEDED";
  if (PROGRESS.has(s)) return "IN_PROGRESS";
  return "NOT_STARTED";
}

/**
 * Apply an external system status to every task carrying `adapterKey`.
 *  - COMPLETE: task DONE and unblocked (clears the flag). The stage is never forced (D10): it
 *    advances only through normal gating, once every PEV gating task (including
 *    `offer-conditions-met`) is done.
 *  - ACTION_NEEDED: task BLOCKED, journey flagged (shows on LM and MI dashboards).
 *  - FAILED: task BLOCKED, reassigned to PNP, flagged. The journey is NOT exited.
 *  - IN_PROGRESS: task IN_PROGRESS (and unblocked) when it was TODO/BLOCKED.
 *  - NOT_STARTED: unblocks a previously BLOCKED task back to TODO.
 */
export function applyIntegrationStatus(
  journey: JourneyState,
  adapterKey: string,
  status: string,
  ctx?: Ctx & { detail?: string },
): EngineResult {
  assertActive(journey);
  const norm = normalizeIntegrationStatus(status);
  const events: NewEvent[] = [
    ev(journey, ctx, {
      type: norm === "FAILED" ? "INTEGRATION_FAILED" : "INTEGRATION_STATUS",
      entity: "Integration",
      entityId: adapterKey,
      from: null,
      to: status,
      data: { normalized: norm, ...(norm === "FAILED" ? { escalateTo: "PNP" } : {}) },
    }),
  ];
  const label = adapterKey;
  const tasks = journey.tasks.map((t) => {
    if (t.adapterKey !== adapterKey || !t.applicable || t.status === "DONE") return t;
    let next: TaskStatus = t.status;
    let blockedReason: string | null = t.blockedReason;
    let owner = t.owner;
    switch (norm) {
      case "COMPLETE":
        next = "DONE";
        blockedReason = null;
        break;
      case "ACTION_NEEDED":
        next = "BLOCKED";
        blockedReason = ctx?.detail ?? `${label}: action needed`;
        break;
      case "FAILED":
        next = "BLOCKED";
        blockedReason = ctx?.detail ?? `${label}: failed, referred to People & Places`;
        owner = "PNP";
        break;
      case "IN_PROGRESS":
        if (t.status === "TODO" || t.status === "BLOCKED") next = "IN_PROGRESS";
        if (t.status === "BLOCKED") blockedReason = null;
        break;
      case "NOT_STARTED":
        if (t.status === "BLOCKED") {
          next = "TODO";
          blockedReason = null;
        }
        break;
    }
    if (next === t.status && owner === t.owner && blockedReason === t.blockedReason) return t;
    if (next !== t.status) {
      events.push(
        ev(journey, ctx, {
          type: "TASK_STATUS_CHANGED",
          entity: "Task",
          entityId: t.id,
          from: t.status,
          to: next,
          data: { key: t.key, via: adapterKey, blockedReason },
        }),
      );
    }
    return {
      ...t,
      status: next,
      owner,
      blockedReason,
      completedAt: next === "DONE" ? nowOf(ctx) : t.completedAt,
    };
  });
  const j: JourneyState = { ...journey, tasks };

  const s = settle(j, ctx);
  return { journey: s.journey, events: [...events, ...s.events] };
}

// ---------------------------------------------------------------------- exit

export interface ExitOptions extends Ctx {
  /** Extra audit data merged into the JOURNEY_EXITED event (e.g. reasonSource, comment). */
  data?: Record<string, unknown>;
}

/** D14: `reason` must be one of EXIT_REASONS. The comment belongs in `data` (event only), never on the journey. */
export function exitJourney(journey: JourneyState, reason: string, ctx?: ExitOptions): EngineResult {
  assertActive(journey);
  if (!reason.trim()) throw new EngineError("An exit reason is required");
  if (!isExitReason(reason.trim())) throw new EngineError(`Unknown exit reason: ${reason.trim()}`);
  const j: JourneyState = {
    ...journey,
    status: "exited",
    exitReason: reason.trim(),
    exitStage: journey.currentStage,
  };
  return {
    journey: j,
    events: [
      ev(j, ctx, {
        type: "JOURNEY_EXITED",
        entity: "Journey",
        entityId: j.id,
        from: "active",
        to: "exited",
        data: { ...(ctx?.data ?? {}), reason: j.exitReason, stage: journey.currentStage },
      }),
    ],
  };
}

// ------------------------------------------------------------------ progress

export interface Progress {
  percent: number;
  total: number;
  done: number;
  remaining: number;
  stage: Stage;
  stageIndex: number;
  stageCount: number;
  perStage: Record<Stage, { total: number; done: number }>;
  /** Not-DONE tasks sorted by due date: feeds the forecast (FR-1.4). */
  nextDue: TaskState[];
  overdue: TaskState[];
  blocked: TaskState[];
}

export function progress(journey: JourneyState, now: Date = new Date(), nextLimit = 5): Progress {
  const live = journey.tasks.filter((t) => t.applicable);
  const done = live.filter((t) => t.status === "DONE").length;
  const open = live.filter((t) => t.status !== "DONE");
  const byDue = (a: TaskState, b: TaskState) =>
    a.dueDate.getTime() - b.dueDate.getTime() || a.sortOrder - b.sortOrder || a.key.localeCompare(b.key);
  const perStage = Object.fromEntries(
    STAGES.map((s) => {
      const st = live.filter((t) => t.stage === s);
      return [s, { total: st.length, done: st.filter((t) => t.status === "DONE").length }];
    }),
  ) as Progress["perStage"];
  return {
    percent: live.length === 0 ? 0 : Math.round((done / live.length) * 100),
    total: live.length,
    done,
    remaining: open.length,
    stage: journey.currentStage,
    stageIndex: stageIndex(journey.currentStage),
    stageCount: STAGES.length,
    perStage,
    nextDue: [...open].sort(byDue).slice(0, nextLimit),
    overdue: open.filter((t) => t.dueDate.getTime() < now.getTime()).sort(byDue),
    blocked: open.filter((t) => t.status === "BLOCKED").sort(byDue),
  };
}
