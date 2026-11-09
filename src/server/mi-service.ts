/**
 * MI service (WS3): metric functions and queries for the P&P dashboard.
 * Pure functions take plain data so they unit-test without a database. Queries
 * read through Prisma; every state change (chase, support) records an Event.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { recordEvent, toJourneyState } from "./journey-service";
import { getAdapter } from "@/adapters/registry";
import { COLLEAGUE_REASONS, PNP_REASONS } from "@/components/mi/labels";
import type { MiFilters } from "@/components/mi/filters";
import { STAGES, type JourneyState, type Stage, type TaskState } from "@/domain/types";

const DAY = 86_400_000;
export const CHASE_COOLDOWN_MS = DAY;
/** Offer to start can be up to 3 months, so "starting soon" looks 13 weeks ahead. */
export const UPCOMING_DAYS = 91;
export const CHASE_EVENT_TYPE = "NUDGE_SENT";
export const SUPPORT_EVENT_TYPE = "SUPPORT_RAISED";

// ------------------------------------------------------------------ filters

export { STATUS_FILTERS, parseFilters, filtersToQuery } from "@/components/mi/filters";
export type { MiFilters, StatusFilter } from "@/components/mi/filters";

export function journeyWhere(f: MiFilters, opts: { ignoreStatus?: boolean } = {}): Prisma.JourneyWhereInput {
  const where: Prisma.JourneyWhereInput = {};
  if (f.stage) where.currentStage = f.stage;
  if (f.from || f.to) {
    where.startDate = {
      ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}),
      ...(f.to ? { lte: new Date(`${f.to}T23:59:59.999Z`) } : {}),
    };
  }
  if (f.team) where.teamId = f.team;
  if (f.area) where.team = { area: f.area };
  if (!opts.ignoreStatus && f.status) {
    if (f.status === "flagged") where.flagged = true;
    else where.status = f.status;
  }
  return where;
}

// ------------------------------------------------------------------ routing

/** Owning team label for each integration (who to ask when a SYSTEM step fails). */
export const INTEGRATION_OWNER_LABEL: Record<string, string> = {
  identity: "Identity and Access team",
  sailpoint: "Identity and Access team",
  firstadvantage: "First Advantage",
  workday: "HR Systems team",
  itrequest: "IT Service Desk",
  equipment: "IT Equipment team",
  pass: "Security and Facilities team",
  booking: "Facilities team",
  photocheck: "Security and Facilities team",
  chatbot: "Digital Platform team",
  notification: "Digital Platform team",
};

export interface SupportRoute {
  /** NotificationAdapter toUserId: a real user id, or `queue:<slug>` for a team queue. */
  toUserId: string;
  label: string;
  kind: "USER" | "QUEUE";
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * FR-MI.2 routing. LM-owned goes to that journey's LM; P&P-owned to the P&P queue;
 * SYSTEM-owned to the integration's owning team. STARTER and BUDDY tasks go to the LM,
 * who can act on them (see canActOnTask).
 */
export function routeSupport(task: { owner: string; adapterKey: string | null }, lm: { id: string; name: string }): SupportRoute {
  switch (task.owner) {
    case "PNP":
      return { toUserId: "queue:pnp", label: "P&P queue", kind: "QUEUE" };
    case "SYSTEM": {
      const label = (task.adapterKey && INTEGRATION_OWNER_LABEL[task.adapterKey]) || "Integrations support";
      return { toUserId: `queue:${slug(label)}`, label, kind: "QUEUE" };
    }
    default:
      return { toUserId: lm.id, label: `Line manager: ${lm.name}`, kind: "USER" };
  }
}

// ------------------------------------------------------------------- issues

export type IssueKind = "FAILED" | "ACTION_NEEDED" | "BLOCKED" | "OVERDUE";

export interface Issue {
  journeyId: string;
  starterName: string;
  stage: Stage;
  taskKey: string;
  title: string;
  kind: IssueKind;
  owner: string;
  adapterKey: string | null;
  daysOverdue: number;
  blockedReason: string | null;
  lmId: string;
  lmName: string;
  routeLabel: string;
}

export const daysBetween = (later: Date, earlier: Date): number => Math.floor((later.getTime() - earlier.getTime()) / DAY);

/** Past due and still actionable (LOCKED tasks wait on a dependency, so they are not counted). */
export const isOverdue = (t: Pick<TaskState, "status" | "dueDate" | "applicable">, now: Date): boolean =>
  t.applicable && (t.status === "TODO" || t.status === "IN_PROGRESS" || t.status === "BLOCKED") && t.dueDate.getTime() < now.getTime();

/** Issue kind for a task, or null when it is not an issue. Integration status wins over generic BLOCKED. */
export function classifyTask(t: TaskState, integrationStatus: string | undefined, now: Date): IssueKind | null {
  if (!t.applicable || t.status === "DONE" || t.status === "LOCKED") return null;
  const s = integrationStatus?.toLowerCase();
  if (t.adapterKey && s === "failed") return "FAILED";
  if (t.adapterKey && s === "action_needed") return "ACTION_NEEDED";
  if (t.status === "BLOCKED") return "BLOCKED";
  if (isOverdue(t, now)) return "OVERDUE";
  return null;
}

export function buildIssues(
  journeys: JourneyState[],
  names: Map<string, string>,
  integration: Map<string, string>, // `${journeyId}|${adapterKey}` -> status
  now: Date,
): Issue[] {
  const out: Issue[] = [];
  for (const j of journeys) {
    if (j.status !== "active") continue;
    const lmName = names.get(j.lmId) ?? "Unknown";
    for (const t of j.tasks) {
      const kind = classifyTask(t, t.adapterKey ? integration.get(`${j.id}|${t.adapterKey}`) : undefined, now);
      if (!kind) continue;
      out.push({
        journeyId: j.id,
        starterName: names.get(j.starterId) ?? "Unknown",
        stage: j.currentStage,
        taskKey: t.key,
        title: t.title,
        kind,
        owner: t.owner,
        adapterKey: t.adapterKey,
        daysOverdue: isOverdue(t, now) ? Math.max(1, daysBetween(now, t.dueDate)) : 0,
        blockedReason: t.blockedReason,
        lmId: j.lmId,
        lmName,
        routeLabel: routeSupport(t, { id: j.lmId, name: lmName }).label,
      });
    }
  }
  const rank: Record<IssueKind, number> = { FAILED: 0, ACTION_NEEDED: 1, BLOCKED: 2, OVERDUE: 3 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.daysOverdue - a.daysOverdue || a.starterName.localeCompare(b.starterName));
}

// -------------------------------------------------------------------- chase

export interface ChaseRow {
  lmId: string;
  lmName: string;
  overdue: { journeyId: string; starterName: string; taskKey: string; title: string; daysOverdue: number }[];
  lastChasedAt: string | null;
  canChase: boolean;
  /** Set when canChase is false: when chasing is possible again. */
  blockedUntil: string | null;
}

/** True when a chase was sent less than 24h ago. */
export const chaseSuppressed = (lastChasedAt: Date | null, now: Date): boolean =>
  !!lastChasedAt && now.getTime() - lastChasedAt.getTime() < CHASE_COOLDOWN_MS;

/** D3: one row per LM that owns any past-due, not-DONE task. `lastChased` maps lmId to the latest chase time. */
export function buildChaseRows(journeys: JourneyState[], names: Map<string, string>, lastChased: Map<string, Date>, now: Date): ChaseRow[] {
  const byLm = new Map<string, ChaseRow["overdue"]>();
  for (const j of journeys) {
    if (j.status !== "active") continue;
    for (const t of j.tasks) {
      if (t.owner !== "LM" || !isOverdue(t, now)) continue;
      const list = byLm.get(j.lmId) ?? [];
      list.push({ journeyId: j.id, starterName: names.get(j.starterId) ?? "Unknown", taskKey: t.key, title: t.title, daysOverdue: Math.max(1, daysBetween(now, t.dueDate)) });
      byLm.set(j.lmId, list);
    }
  }
  return [...byLm.entries()]
    .map(([lmId, overdue]) => {
      const last = lastChased.get(lmId) ?? null;
      const suppressed = chaseSuppressed(last, now);
      return {
        lmId,
        lmName: names.get(lmId) ?? "Unknown",
        overdue: overdue.sort((a, b) => b.daysOverdue - a.daysOverdue),
        lastChasedAt: last ? last.toISOString() : null,
        canChase: !suppressed,
        blockedUntil: suppressed && last ? new Date(last.getTime() + CHASE_COOLDOWN_MS).toISOString() : null,
      };
    })
    .sort((a, b) => b.overdue.length - a.overdue.length || a.lmName.localeCompare(b.lmName));
}

// ------------------------------------------- funnel and time-in-stage (events)

export interface StageEvent {
  journeyId: string | null;
  type: string;
  from: string | null;
  to: string | null;
  createdAt: Date;
}

export interface FunnelRow {
  stage: Stage;
  reached: number;
  /** % of journeys that reached the first stage. */
  pct: number;
  /** Completed stays only (journeys that left the stage). */
  stays: number;
  medianDays: number | null;
  avgDays: number | null;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const isStage = (s: string | null): s is Stage => !!s && (STAGES as readonly string[]).includes(s);
const FUNNEL_EVENTS = ["JOURNEY_CREATED", "STAGE_CHANGED", "JOURNEY_EXITED", "JOURNEY_COMPLETED"];

/**
 * Funnel and time-in-stage from the event log. A journey enters the first stage at
 * JOURNEY_CREATED and each later stage at STAGE_CHANGED(to). A stay ends at the next
 * entry, or at JOURNEY_EXITED / JOURNEY_COMPLETED for the last stage. Open stays
 * (journey still in that stage) are excluded from time-in-stage.
 */
export function computeFunnel(events: StageEvent[], journeyIds: Iterable<string>): FunnelRow[] {
  const ids = new Set(journeyIds);
  const byJourney = new Map<string, StageEvent[]>();
  for (const e of events) {
    if (!e.journeyId || !ids.has(e.journeyId) || !FUNNEL_EVENTS.includes(e.type)) continue;
    const l = byJourney.get(e.journeyId) ?? [];
    l.push(e);
    byJourney.set(e.journeyId, l);
  }
  const reached = new Map<Stage, number>(STAGES.map((s) => [s, 0]));
  const durations = new Map<Stage, number[]>(STAGES.map((s) => [s, []]));

  for (const list of byJourney.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const entries: { stage: Stage; at: Date }[] = [];
    let end: Date | null = null;
    for (const e of list) {
      if (e.type === "JOURNEY_CREATED" && !entries.length) entries.push({ stage: STAGES[0], at: e.createdAt });
      else if (e.type === "STAGE_CHANGED" && isStage(e.to)) {
        if (!entries.length && isStage(e.from)) entries.push({ stage: e.from, at: e.createdAt });
        entries.push({ stage: e.to, at: e.createdAt });
      } else if (e.type === "JOURNEY_EXITED" || e.type === "JOURNEY_COMPLETED") end = e.createdAt;
    }
    const seen = new Set<Stage>();
    entries.forEach((en, i) => {
      if (!seen.has(en.stage)) {
        seen.add(en.stage);
        reached.set(en.stage, (reached.get(en.stage) ?? 0) + 1);
      }
      const leftAt = entries[i + 1]?.at ?? end;
      if (leftAt) durations.get(en.stage)!.push(Math.max(0, (leftAt.getTime() - en.at.getTime()) / DAY));
    });
  }
  const first = reached.get(STAGES[0]) ?? 0;
  return STAGES.map((stage) => {
    const d = durations.get(stage)!;
    const m = median(d);
    return {
      stage,
      reached: reached.get(stage) ?? 0,
      pct: first ? Math.round(((reached.get(stage) ?? 0) / first) * 100) : 0,
      stays: d.length,
      medianDays: m === null ? null : round1(m),
      avgDays: d.length ? round1(d.reduce((a, b) => a + b, 0) / d.length) : null,
    };
  });
}

// --------------------------------------------------------------------- exits

export interface ExitRow {
  journeyId: string;
  starterName: string;
  workEmail: string;
  stage: string | null;
  reason: string | null;
  /** COLLEAGUE | PNP, from the exit event (inferred from the reason code when absent). */
  reasonSource: "COLLEAGUE" | "PNP" | null;
  /** Short free-text comment. May contain personal data: excluded from CSV unless asked for. */
  comment: string | null;
  exitedAt: string | null;
}

export interface ExitReport {
  rows: ExitRow[];
  byReason: { key: string; count: number }[];
  byStage: { key: string; count: number }[];
  colleagueSupplied: { count: number; total: number; pct: number };
}

/** Explicit source wins; otherwise infer from the reason category; unknown/legacy stays null. */
export function resolveReasonSource(reason: string | null, explicit: unknown): "COLLEAGUE" | "PNP" | null {
  if (explicit === "COLLEAGUE" || explicit === "PNP") return explicit;
  if (reason && (COLLEAGUE_REASONS as readonly string[]).includes(reason)) return "COLLEAGUE";
  if (reason && (PNP_REASONS as readonly string[]).includes(reason)) return "PNP";
  return null;
}

const tally = (xs: string[], order?: readonly string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  const rows = [...m.entries()].map(([key, count]) => ({ key, count }));
  return order
    ? rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    : rows.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
};

export function buildExitReport(rows: ExitRow[]): ExitReport {
  const col = rows.filter((r) => r.reasonSource === "COLLEAGUE").length;
  return {
    colleagueSupplied: { count: col, total: rows.length, pct: rows.length ? Math.round((col / rows.length) * 100) : 0 },
    rows: [...rows].sort((a, b) => (b.exitedAt ?? "").localeCompare(a.exitedAt ?? "")),
    byReason: tally(rows.map((r) => r.reason ?? "Not recorded")),
    byStage: tally(rows.map((r) => r.stage ?? "Unknown"), STAGES),
  };
}

// ----------------------------------------------------------------- overview

export interface Kpis {
  active: number;
  startingSoon: number;
  flagged: number;
  exited: number;
  completed: number;
}

export function computeKpis(journeys: Pick<JourneyState, "status" | "flagged" | "startDate">[], now: Date): Kpis {
  const horizon = now.getTime() + UPCOMING_DAYS * DAY;
  return {
    active: journeys.filter((j) => j.status === "active").length,
    startingSoon: journeys.filter((j) => j.status === "active" && j.startDate.getTime() >= now.getTime() && j.startDate.getTime() <= horizon).length,
    flagged: journeys.filter((j) => j.flagged && j.status === "active").length,
    exited: journeys.filter((j) => j.status === "exited").length,
    completed: journeys.filter((j) => j.status === "completed").length,
  };
}

export function countByStage(journeys: Pick<JourneyState, "currentStage">[]): { stage: Stage; count: number }[] {
  return STAGES.map((stage) => ({ stage, count: journeys.filter((j) => j.currentStage === stage).length }));
}

export interface JourneyRow {
  id: string;
  starterName: string;
  workEmail: string;
  lmName: string;
  teamName: string;
  area: string | null;
  stage: Stage;
  status: string;
  flagged: boolean;
  flagReason: string | null;
  startDate: string;
  doneTasks: number;
  totalTasks: number;
}

export interface Overview {
  generatedAt: string;
  filters: MiFilters;
  options: { areas: string[]; teams: { id: string; name: string; area: string | null }[] };
  kpis: Kpis;
  byStage: { stage: Stage; count: number }[];
  funnel: FunnelRow[];
  journeys: JourneyRow[];
  issues: Issue[];
  chase: ChaseRow[];
  exits: ExitReport;
}

type Loaded = {
  journeys: JourneyState[];
  rows: JourneyRow[];
  names: Map<string, string>;
  emails: Map<string, string>;
  events: (StageEvent & { data?: unknown })[];
  exitedAt: Map<string, Date>;
  exitData: Map<string, { reasonSource?: unknown; comment?: unknown }>;
};

async function loadFiltered(f: MiFilters, opts: { ignoreStatus?: boolean } = {}): Promise<Loaded> {
  const rows = await prisma.journey.findMany({
    where: journeyWhere(f, opts),
    include: { tasks: true, team: true },
    orderBy: { startDate: "asc" },
  });
  const journeys = rows.map(toJourneyState);
  const userIds = [...new Set(rows.flatMap((r) => [r.starterId, r.lmId]))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, upn: true } });
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  const emails = new Map(users.map((u) => [u.id, u.upn]));
  const events = await prisma.event.findMany({
    where: { journeyId: { in: journeys.map((j) => j.id) }, type: { in: FUNNEL_EVENTS } },
    select: { journeyId: true, type: true, from: true, to: true, createdAt: true, data: true },
  });
  const exitedAt = new Map<string, Date>();
  const exitData = new Map<string, { reasonSource?: unknown; comment?: unknown }>();
  for (const e of events) {
    if (e.type === "JOURNEY_EXITED" && e.journeyId) {
      exitedAt.set(e.journeyId, e.createdAt);
      exitData.set(e.journeyId, (e.data ?? {}) as { reasonSource?: unknown; comment?: unknown });
    }
  }
  const table: JourneyRow[] = rows.map((r, i) => ({
    id: r.id,
    starterName: names.get(r.starterId) ?? "Unknown",
    workEmail: emails.get(r.starterId) ?? "",
    lmName: names.get(r.lmId) ?? "Unknown",
    teamName: r.team.name,
    area: r.team.area,
    stage: r.currentStage as Stage,
    status: r.status,
    flagged: r.flagged,
    flagReason: r.flagReason,
    startDate: r.startDate.toISOString(),
    doneTasks: journeys[i].tasks.filter((t) => t.applicable && t.status === "DONE").length,
    totalTasks: journeys[i].tasks.filter((t) => t.applicable).length,
  }));
  return { journeys, rows: table, names, emails, events, exitedAt, exitData };
}

async function integrationMap(journeyIds: string[]): Promise<Map<string, string>> {
  const rows = await prisma.integrationState.findMany({ where: { journeyId: { in: journeyIds } }, select: { journeyId: true, adapterKey: true, status: true } });
  return new Map(rows.map((r) => [`${r.journeyId}|${r.adapterKey}`, r.status]));
}

/** Latest chase time per LM, from the audit log. */
export async function lastChasedByLm(lmIds: string[]): Promise<Map<string, Date>> {
  const evs = await prisma.event.findMany({
    where: { type: CHASE_EVENT_TYPE, entity: "User", entityId: { in: lmIds } },
    orderBy: { createdAt: "asc" },
    select: { entityId: true, createdAt: true, data: true },
  });
  const m = new Map<string, Date>();
  for (const e of evs) if (e.entityId && (e.data as { kind?: string } | null)?.kind === "CHASE_LM") m.set(e.entityId, e.createdAt);
  return m;
}

export async function getJourneyRows(f: MiFilters): Promise<JourneyRow[]> {
  return (await loadFiltered(f)).rows;
}

export async function getIssues(f: MiFilters, now = new Date()): Promise<Issue[]> {
  const l = await loadFiltered(f);
  return buildIssues(l.journeys, l.names, await integrationMap(l.journeys.map((j) => j.id)), now);
}

function exitReportFrom(l: Loaded, updatedAt: Map<string, Date>): ExitReport {
  return buildExitReport(
    l.journeys
      .filter((j) => j.status === "exited")
      .map((j) => ({
        journeyId: j.id,
        starterName: l.names.get(j.starterId) ?? "Unknown",
        workEmail: l.emails.get(j.starterId) ?? "",
        stage: j.exitStage,
        reason: j.exitReason,
        reasonSource: resolveReasonSource(j.exitReason, l.exitData.get(j.id)?.reasonSource),
        comment: typeof l.exitData.get(j.id)?.comment === "string" ? String(l.exitData.get(j.id)!.comment).slice(0, 300) : null,
        exitedAt: (l.exitedAt.get(j.id) ?? updatedAt.get(j.id) ?? null)?.toISOString() ?? null,
      })),
  );
}

export async function getExitReport(f: MiFilters): Promise<ExitReport> {
  const l = await loadFiltered({ ...f, status: "exited" });
  const meta = await prisma.journey.findMany({ where: { id: { in: l.journeys.map((j) => j.id) } }, select: { id: true, updatedAt: true } });
  return exitReportFrom(l, new Map(meta.map((m) => [m.id, m.updatedAt])));
}

export async function getFunnel(f: MiFilters): Promise<FunnelRow[]> {
  const l = await loadFiltered(f);
  return computeFunnel(l.events, l.journeys.map((j) => j.id));
}

export async function getOverview(f: MiFilters, now = new Date()): Promise<Overview> {
  const main = await loadFiltered(f);
  // KPI tiles ignore the status filter so they stay a stable summary of the other filters.
  const kpiSet = f.status ? await loadFiltered(f, { ignoreStatus: true }) : main;
  const [integration, teams, exits] = await Promise.all([
    integrationMap(main.journeys.map((j) => j.id)),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    getExitReport(f),
  ]);
  const lmIds = [...new Set(main.journeys.map((j) => j.lmId))];
  return {
    generatedAt: now.toISOString(),
    filters: f,
    options: {
      areas: [...new Set(teams.map((t) => t.area).filter((a): a is string => !!a))].sort(),
      teams: teams.map((t) => ({ id: t.id, name: t.name, area: t.area })),
    },
    kpis: computeKpis(kpiSet.journeys, now),
    byStage: countByStage(main.journeys),
    funnel: computeFunnel(main.events, main.journeys.map((j) => j.id)),
    journeys: main.rows,
    issues: buildIssues(main.journeys, main.names, integration, now),
    chase: buildChaseRows(main.journeys, main.names, await lastChasedByLm(lmIds), now),
    exits,
  };
}

// ------------------------------------------------------------ state changes

export class MiError extends Error {
  constructor(
    public status: 400 | 404 | 409,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** FR-MI.2: route a support request for a task or journey, notify, and audit it. */
export async function raiseSupport(input: { journeyId: string; taskKey?: string | null; note?: string | null }, actorId: string) {
  const row = await prisma.journey.findUnique({ where: { id: input.journeyId }, include: { tasks: true } });
  if (!row) throw new MiError(404, "not_found", "Journey not found");
  const j = toJourneyState(row);
  const task = input.taskKey ? j.tasks.find((t) => t.key === input.taskKey) : null;
  if (input.taskKey && !task) throw new MiError(404, "not_found", "Task not found");
  const users = await prisma.user.findMany({ where: { id: { in: [j.starterId, j.lmId] } }, select: { id: true, displayName: true } });
  const nm = new Map(users.map((u) => [u.id, u.displayName]));
  const lm = { id: j.lmId, name: nm.get(j.lmId) ?? "Line manager" };
  const route: SupportRoute = task ? routeSupport(task, lm) : { toUserId: "queue:pnp", label: "P&P queue", kind: "QUEUE" };
  const note = (input.note ?? "").trim().slice(0, 500);
  const starter = nm.get(j.starterId) ?? "a starter";
  const notifier = await getAdapter("notification");
  const sent = await notifier.send({
    toUserId: route.toUserId,
    kind: "SUPPORT",
    journeyId: j.id,
    subject: `Support requested: ${starter}${task ? ` - ${task.title}` : ""}`,
    body: [task ? `Task: ${task.title} (${task.owner}, ${task.status})` : "Journey-level request", note && `Note: ${note}`].filter(Boolean).join("\n"),
  });
  await recordEvent({
    journeyId: j.id,
    actorId,
    type: SUPPORT_EVENT_TYPE,
    entity: task ? "Task" : "Journey",
    entityId: task ? task.key : j.id,
    data: { routedTo: route.label, toUserId: route.toUserId, note, notificationId: sent.id },
  });
  return { routedTo: route.label, notificationId: sent.id };
}

/** FR-MI.3 + D3: nudge one LM about all their overdue tasks. Refuses within 24h of the last chase. */
export async function chaseLm(lmId: string, actorId: string, now = new Date()) {
  const rows = await prisma.journey.findMany({ where: { lmId, status: "active" }, include: { tasks: true } });
  const journeys = rows.map(toJourneyState);
  const users = await prisma.user.findMany({
    where: { id: { in: [lmId, ...journeys.map((j) => j.starterId)] } },
    select: { id: true, displayName: true },
  });
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  const claimed = await prisma.$transaction(async (tx) => {
    const recent = await tx.event.findMany({
      where: { type: CHASE_EVENT_TYPE, entity: "User", entityId: lmId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const last = recent.find((e) => (e.data as { kind?: string } | null)?.kind === "CHASE_LM");
    if (last && chaseSuppressed(last.createdAt, now)) {
      throw new MiError(409, "recently_chased", "This line manager was chased in the last 24 hours.", {
        lastChasedAt: last.createdAt.toISOString(),
        blockedUntil: new Date(last.createdAt.getTime() + CHASE_COOLDOWN_MS).toISOString(),
      });
    }
    const overdue = buildChaseRows(journeys, names, new Map(), now)[0]?.overdue ?? [];
    if (!overdue.length) throw new MiError(400, "nothing_overdue", "This line manager has no overdue tasks.");
    // Claim first (SQLite serialises writers) so a double click cannot send twice.
    await recordEvent(
      {
        journeyId: null,
        actorId,
        type: CHASE_EVENT_TYPE,
        entity: "User",
        entityId: lmId,
        data: { kind: "CHASE_LM", tasks: overdue.map((t) => ({ journeyId: t.journeyId, taskKey: t.taskKey })) },
        createdAt: now,
      },
      tx,
    );
    return overdue;
  });
  try {
    const notifier = await getAdapter("notification");
    const lines = claimed.map((t) => `- ${t.title} for ${t.starterName} (${t.daysOverdue} day${t.daysOverdue === 1 ? "" : "s"} overdue)`);
    const sent = await notifier.send({
      toUserId: lmId,
      kind: "CHASE_LM",
      subject: `${claimed.length} onboarding task${claimed.length === 1 ? "" : "s"} overdue`,
      body: `Please complete these overdue onboarding tasks:\n${lines.join("\n")}`,
    });
    return { sentAt: now.toISOString(), taskCount: claimed.length, notificationId: sent.id };
  } catch (e) {
    // Release the claim so the chase can be retried.
    await prisma.event.deleteMany({ where: { type: CHASE_EVENT_TYPE, entity: "User", entityId: lmId, actorId, createdAt: now } });
    throw e;
  }
}
