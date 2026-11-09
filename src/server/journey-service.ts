/**
 * Journey service: the ONLY place that writes journey, task and event data.
 * Loads state from Prisma, runs the pure engine, persists tasks + events in one
 * transaction. Other workstreams must go through these functions.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./db";
import {
  addBespokeTask as engAddBespoke,
  applyIntegrationStatus as engApplyIntegration,
  createJourney as engCreate,
  exitJourney as engExit,
  progress as engProgress,
  setTaskStatus as engSetStatus,
  settle,
  type BespokeTaskInput,
  type ExitOptions,
  type Progress,
} from "@/domain/engine";
import type {
  Ctx,
  EngineResult,
  GoalHorizon,
  JourneyState,
  NewEvent,
  Stage,
  TaskState,
  TaskStatus,
  TemplateInput,
} from "@/domain/types";

type Db = PrismaClient | Prisma.TransactionClient;

export const GLOBAL = "GLOBAL";

// ------------------------------------------------------------------ mapping

type JourneyRow = Prisma.JourneyGetPayload<{ include: { tasks: true } }>;

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export function toTaskState(r: JourneyRow["tasks"][number]): TaskState {
  return {
    id: r.id,
    templateId: r.templateId,
    key: r.key,
    title: r.title,
    description: r.description,
    stage: r.stage as Stage,
    owner: r.owner as TaskState["owner"],
    type: r.type as TaskState["type"],
    status: r.status as TaskStatus,
    dueDate: r.dueDate,
    completedAt: r.completedAt,
    blockedReason: r.blockedReason,
    evidence: r.evidence,
    dependsOn: strArr(r.dependsOn),
    source: r.source as TaskState["source"],
    adapterKey: r.adapterKey,
    gating: r.gating,
    optional: r.optional,
    autoCompleteOnOpen: r.autoCompleteOnOpen,
    contentSlug: r.contentSlug,
    condition: r.condition,
    applicable: r.applicable,
    sortOrder: r.sortOrder,
  };
}

export function toJourneyState(r: JourneyRow): JourneyState {
  return {
    id: r.id,
    starterId: r.starterId,
    lmId: r.lmId,
    buddyId: r.buddyId,
    teamId: r.teamId,
    startDate: r.startDate,
    currentStage: r.currentStage as Stage,
    status: r.status as JourneyState["status"],
    exitReason: r.exitReason,
    exitStage: r.exitStage as Stage | null,
    completedAt: r.completedAt,
    flagged: r.flagged,
    flagReason: r.flagReason,
    tasks: r.tasks.map(toTaskState).sort((a, b) => a.sortOrder - b.sortOrder || a.dueDate.getTime() - b.dueDate.getTime()),
  };
}

const taskData = (t: TaskState) => ({
  templateId: t.templateId ?? null,
  key: t.key,
  title: t.title,
  description: t.description,
  stage: t.stage,
  owner: t.owner,
  type: t.type,
  status: t.status,
  dueDate: t.dueDate,
  completedAt: t.completedAt,
  blockedReason: t.blockedReason,
  evidence: t.evidence,
  dependsOn: t.dependsOn,
  source: t.source,
  adapterKey: t.adapterKey,
  gating: t.gating,
  optional: !!t.optional,
  autoCompleteOnOpen: !!t.autoCompleteOnOpen,
  contentSlug: t.contentSlug,
  condition: t.condition,
  applicable: t.applicable,
  sortOrder: t.sortOrder,
});

export const eventData = (e: NewEvent): Prisma.EventUncheckedCreateInput => ({
  journeyId: e.journeyId,
  actorId: e.actorId,
  type: e.type,
  entity: e.entity,
  entityId: e.entityId,
  from: e.from,
  to: e.to,
  data: (e.data ?? undefined) as Prisma.InputJsonValue | undefined,
  createdAt: e.createdAt,
});

// ------------------------------------------------------------------- reads

export async function loadJourney(journeyId: string, db: Db = defaultPrisma): Promise<JourneyState | null> {
  const r = await db.journey.findUnique({ where: { id: journeyId }, include: { tasks: true } });
  return r ? toJourneyState(r) : null;
}

export async function loadJourneyByStarter(starterId: string, db: Db = defaultPrisma): Promise<JourneyState | null> {
  const r = await db.journey.findUnique({ where: { starterId }, include: { tasks: true } });
  return r ? toJourneyState(r) : null;
}

/** `where` comes from journeyScopeWhere() in src/lib/auth/access.ts for role scoping. */
export async function listJourneys(where: Prisma.JourneyWhereInput = {}, db: Db = defaultPrisma): Promise<JourneyState[]> {
  const rows = await db.journey.findMany({ where, include: { tasks: true }, orderBy: { startDate: "asc" } });
  return rows.map(toJourneyState);
}

export async function getProgress(journeyId: string, now = new Date()): Promise<Progress | null> {
  const j = await loadJourney(journeyId);
  return j ? engProgress(j, now) : null;
}

export { engProgress as computeProgress };

export async function listEvents(journeyId: string, db: Db = defaultPrisma) {
  return db.event.findMany({ where: { journeyId }, orderBy: { createdAt: "asc" } });
}

// ------------------------------------------------------------------ writes

/** Persist task diffs, journey fields and events. Must be called inside a transaction. */
export async function persistEngineResult(tx: Db, before: JourneyState | null, result: EngineResult, extraEvents: NewEvent[] = []) {
  const j = result.journey;
  const jData = {
    starterId: j.starterId,
    lmId: j.lmId,
    buddyId: j.buddyId,
    teamId: j.teamId,
    startDate: j.startDate,
    currentStage: j.currentStage,
    status: j.status,
    exitReason: j.exitReason,
    exitStage: j.exitStage,
    completedAt: j.completedAt,
    flagged: j.flagged,
    flagReason: j.flagReason,
  };
  if (!before) {
    await tx.journey.create({ data: { id: j.id, ...jData } });
    await tx.task.createMany({ data: j.tasks.map((t) => ({ id: t.id, journeyId: j.id, ...taskData(t) })) });
  } else {
    await tx.journey.update({ where: { id: j.id }, data: jData });
    const prev = new Map(before.tasks.map((t) => [t.id, JSON.stringify(taskData(t))]));
    for (const t of j.tasks) {
      const old = prev.get(t.id);
      if (old === undefined) {
        await tx.task.create({ data: { id: t.id, journeyId: j.id, ...taskData(t) } });
      } else if (old !== JSON.stringify(taskData(t))) {
        await tx.task.update({ where: { id: t.id }, data: taskData(t) });
      }
    }
  }
  const events = [...result.events, ...extraEvents];
  if (events.length) await tx.event.createMany({ data: events.map(eventData) });
}

/**
 * Load -> run engine -> persist in one transaction. SQLite serialises writers,
 * so concurrent mutations on one journey do not interleave.
 */
export async function mutateJourney(
  journeyId: string,
  fn: (journey: JourneyState) => EngineResult,
  db: PrismaClient = defaultPrisma,
): Promise<JourneyState> {
  return db.$transaction(async (tx) => {
    const before = await loadJourney(journeyId, tx);
    if (!before) throw new NotFoundError(`Journey ${journeyId} not found`);
    const result = fn(before);
    await persistEngineResult(tx, before, result);
    return result.journey;
  });
}

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

export interface CreateJourneyInput {
  starterId: string;
  lmId: string;
  buddyId?: string | null;
  teamId: string;
  startDate: Date;
  actorId?: string | null;
  now?: Date;
}

/** Creates a journey from the active templates (CORE + the team's TEAM templates). */
export async function createJourneyForStarter(input: CreateJourneyInput, db: PrismaClient = defaultPrisma): Promise<JourneyState> {
  return db.$transaction(async (tx) => {
    const rows = await tx.taskTemplate.findMany({ where: { active: true } });
    const templates: TemplateInput[] = rows.map((t) => ({
      id: t.id,
      key: t.key,
      title: t.title,
      description: t.description,
      stage: t.stage as Stage,
      owner: t.owner as TemplateInput["owner"],
      type: t.type as TemplateInput["type"],
      dueOffsetDays: t.dueOffsetDays,
      dependsOn: strArr(t.dependsOn),
      source: t.source as TemplateInput["source"],
      teamId: t.teamId,
      adapterKey: t.adapterKey,
      gating: t.gating,
      optional: t.optional,
      autoCompleteOnOpen: t.autoCompleteOnOpen,
      contentSlug: t.contentSlug,
      condition: t.condition,
      sortOrder: t.sortOrder,
    }));
    const result = engCreate(templates, input);
    await persistEngineResult(tx, null, result);
    return result.journey;
  });
}

export interface ActorOpts extends Ctx {
  blockedReason?: string | null;
  evidence?: string | null;
}

export const setTaskStatus = (journeyId: string, taskKey: string, status: TaskStatus, opts: ActorOpts = {}) =>
  mutateJourney(journeyId, (j) => engSetStatus(j, taskKey, status, opts));

export const completeTask = (journeyId: string, taskKey: string, opts: ActorOpts = {}) =>
  setTaskStatus(journeyId, taskKey, "DONE", opts);

export const addBespokeTask = (journeyId: string, input: BespokeTaskInput, ctx: Ctx = {}) =>
  mutateJourney(journeyId, (j) => engAddBespoke(j, input, ctx));

/** Called with the adapter's reported status (e.g. admin simulation or a webhook). Also records IntegrationState. */
export async function applyIntegrationStatus(
  journeyId: string,
  adapterKey: string,
  status: string,
  ctx: Ctx & { detail?: string } = {},
  db: PrismaClient = defaultPrisma,
): Promise<JourneyState> {
  return db.$transaction(async (tx) => {
    const before = await loadJourney(journeyId, tx);
    if (!before) throw new NotFoundError(`Journey ${journeyId} not found`);
    const result = engApplyIntegration(before, adapterKey, status, ctx);
    await persistEngineResult(tx, before, result);
    const existing = await tx.integrationState.findUnique({ where: { journeyId_adapterKey: { journeyId, adapterKey } } });
    if (existing) await tx.integrationState.update({ where: { id: existing.id }, data: { status } });
    else await tx.integrationState.create({ data: { journeyId, adapterKey, status, payload: {} } });
    return result.journey;
  });
}

/** `ctx.data` (e.g. `{ reasonSource, comment }`) is merged into the JOURNEY_EXITED event. */
export const exitJourney = (journeyId: string, reason: string, ctx: ExitOptions = {}) =>
  mutateJourney(journeyId, (j) => engExit(j, reason, ctx));

/** Re-run recompute/advance/flag (e.g. after an admin edits dependencies). */
export const recomputeJourney = (journeyId: string, ctx: Ctx = {}) =>
  mutateJourney(journeyId, (j) => settle(j, ctx));

/** Record an audit event that has no engine state change (nudges, support requests, overrides). */
export async function recordEvent(
  e: Omit<NewEvent, "createdAt" | "from" | "to" | "data" | "entityId"> &
    Partial<Pick<NewEvent, "from" | "to" | "data" | "entityId" | "createdAt">>,
  db: Db = defaultPrisma,
) {
  await db.event.create({
    data: eventData({ from: null, to: null, data: null, entityId: null, createdAt: new Date(), ...e }),
  });
}

// ------- journey-adjacent records (each writes an audit event in the same tx)

const evt = (journeyId: string, actorId: string | null | undefined, type: string, entity: string, entityId: string | null, data?: Record<string, unknown>): NewEvent => ({
  journeyId, actorId: actorId ?? null, type, entity, entityId, from: null, to: null, data: data ?? null, createdAt: new Date(),
});

/** FR-1.3: buddy must be a different person from the LM and the starter. */
export async function allocateBuddy(journeyId: string, buddyId: string, actorId: string | null, db: PrismaClient = defaultPrisma) {
  return db.$transaction(async (tx) => {
    const j = await tx.journey.findUnique({ where: { id: journeyId } });
    if (!j) throw new NotFoundError(`Journey ${journeyId} not found`);
    if (buddyId === j.lmId || buddyId === j.starterId) throw new ValidationError("Buddy must not be the line manager or the starter");
    const buddy = await tx.user.findUnique({ where: { id: buddyId } });
    if (!buddy || !buddy.buddyEligible) throw new ValidationError("User is not buddy-eligible");
    await tx.journey.update({ where: { id: journeyId }, data: { buddyId } });
    await tx.event.create({ data: eventData({ ...evt(journeyId, actorId, "BUDDY_ALLOCATED", "Journey", journeyId, { buddyId }), from: j.buddyId, to: buddyId }) });
  });
}

export async function proposeDay0(journeyId: string, v: { where: string; whenAt: Date; who: string; notes?: string | null }, proposedById: string, db: PrismaClient = defaultPrisma) {
  return db.$transaction(async (tx) => {
    await tx.day0Arrangement.upsert({
      where: { journeyId },
      create: { journeyId, ...v, proposedById },
      update: { ...v, proposedById, confirmedAt: null },
    });
    await tx.event.create({ data: eventData(evt(journeyId, proposedById, "DAY0_PROPOSED", "Day0Arrangement", journeyId, v)) });
  });
}

export async function confirmDay0(journeyId: string, actorId: string, db: PrismaClient = defaultPrisma) {
  return db.$transaction(async (tx) => {
    const d = await tx.day0Arrangement.findUnique({ where: { journeyId } });
    if (!d) throw new NotFoundError("No Day 0 arrangement proposed");
    await tx.day0Arrangement.update({ where: { journeyId }, data: { confirmedAt: new Date() } });
    await tx.event.create({ data: eventData(evt(journeyId, actorId, "DAY0_CONFIRMED", "Day0Arrangement", journeyId)) });
  });
}

export async function upsertCheckIn(journeyId: string, v: { cadence: string; scheduledAt: Date; meetingLink?: string | null }, actorId: string, db: PrismaClient = defaultPrisma) {
  return db.$transaction(async (tx) => {
    const c = await tx.checkIn.create({ data: { journeyId, ...v } });
    await tx.event.create({ data: eventData(evt(journeyId, actorId, "CHECKIN_SET", "CheckIn", c.id, { cadence: v.cadence })) });
    return c;
  });
}

export async function addGoal(journeyId: string, v: { horizon: GoalHorizon; text: string }, authorId: string, db: PrismaClient = defaultPrisma) {
  return db.$transaction(async (tx) => {
    const g = await tx.goal.create({ data: { journeyId, ...v, authorId } });
    await tx.event.create({ data: eventData(evt(journeyId, authorId, "GOAL_ADDED", "Goal", g.id, { horizon: v.horizon })) });
    return g;
  });
}

export async function updateGoal(goalId: string, v: { text?: string; done?: boolean }, actorId: string, db: PrismaClient = defaultPrisma) {
  return db.$transaction(async (tx) => {
    const g = await tx.goal.update({ where: { id: goalId }, data: v });
    await tx.event.create({ data: eventData(evt(g.journeyId, actorId, "GOAL_UPDATED", "Goal", g.id, v)) });
    return g;
  });
}
