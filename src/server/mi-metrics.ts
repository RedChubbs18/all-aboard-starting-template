/**
 * MI metric functions (D36). Pure: they take plain data (journey state, names, event rows) so they
 * unit-test without a database. `mi-service.ts` loads the data and calls these.
 * "Overdue" is the single D3 definition, `isOverdue` in src/domain/engine.ts.
 */
import { LEAD_BUCKETS, MAJOR_FLAG, DAY0_TASK_KEY, EARLY_WARNING, READINESS, type EarlySignalKind, type MajorFlagRule } from "@/components/mi/rules";
import { isEffectivelyDone, isOverdue } from "@/domain/engine";
import { STAGES, type JourneyState, type Stage, type TaskState } from "@/domain/types";

export const DAY = 86_400_000;
export const CHASE_COOLDOWN_MS = DAY;

export const daysBetween = (later: Date, earlier: Date): number => Math.floor((later.getTime() - earlier.getTime()) / DAY);
const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const avg = (xs: number[]): number | null => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Percentile by linear interpolation between closest ranks (p in 0..100). Null for an empty sample. */
export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (Math.min(100, Math.max(0, p)) / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}
export const median = (xs: number[]): number | null => percentile(xs, 50);

export interface StageEvent {
  journeyId: string | null;
  type: string;
  from: string | null;
  to: string | null;
  createdAt: Date;
  entityId?: string | null;
  data?: unknown;
}

/** Per-journey facts that are not part of the engine state. */
export interface JourneyMeta {
  teamId: string;
  teamName: string;
  area: string | null;
  /** Offer accepted: the JOURNEY_CREATED event, else the row's createdAt. */
  createdAt: Date;
}

export const isStage = (s: string | null): s is Stage => !!s && (STAGES as readonly string[]).includes(s);

// ------------------------------------------------------- LM accountability

export interface LmTaskFact {
  lmId: string;
  journeyId: string;
  starterName: string;
  teamId: string;
  teamName: string;
  area: string | null;
  taskKey: string;
  title: string;
  startDate: Date;
  dueDate: Date;
  completedAt: Date | null;
  /** Effectively done (DONE, or satisfied by an override). */
  done: boolean;
  /** Actionable now: active journey, applicable, not done, not waiting (LOCKED). */
  open: boolean;
  overdue: boolean;
  daysOverdue: number;
}

/** One fact per applicable, non-optional LM-owned task. Unfinished tasks only count on active journeys. */
export function lmTaskFacts(journeys: JourneyState[], names: Map<string, string>, meta: Map<string, JourneyMeta>, now: Date): LmTaskFact[] {
  const out: LmTaskFact[] = [];
  for (const j of journeys) {
    const m = meta.get(j.id);
    for (const t of j.tasks) {
      if (t.owner !== "LM" || !t.applicable || t.optional) continue;
      const done = t.status === "DONE" || isEffectivelyDone(t, j.tasks);
      const active = j.status === "active";
      if (!done && !active) continue;
      const overdue = active && isOverdue(t, now, j.tasks);
      out.push({
        lmId: j.lmId,
        journeyId: j.id,
        starterName: names.get(j.starterId) ?? "Unknown",
        teamId: m?.teamId ?? j.teamId,
        teamName: m?.teamName ?? j.teamId,
        area: m?.area ?? null,
        taskKey: t.key,
        title: t.title,
        startDate: j.startDate,
        dueDate: t.dueDate,
        completedAt: t.completedAt,
        done,
        open: active && !done && t.status !== "LOCKED",
        overdue,
        daysOverdue: overdue ? Math.max(1, daysBetween(now, t.dueDate)) : 0,
      });
    }
  }
  return out;
}

export interface MajorFlag {
  lmId: string;
  lmName: string;
  teamName: string;
  area: string | null;
  /** Null for the LM-level "too many overdue" flag. */
  journeyId: string | null;
  starterName: string | null;
  taskKey: string | null;
  title: string | null;
  daysOverdue: number;
  rules: MajorFlagRule[];
  detail: string;
}

/**
 * Major flags, with the three published rules (see MAJOR_FLAG_RULES):
 * 1. an LM action more than 5 days overdue; 2. an LM with more than 3 overdue actions (one LM-level item);
 * 3. "Propose Day 0 arrangements" overdue with the start date 5 days away or less (or passed).
 * A task that trips rules 1 and 3 is one item with both rules.
 */
export function buildMajorFlags(facts: LmTaskFact[], lmNames: Map<string, string>, now: Date): MajorFlag[] {
  const out: MajorFlag[] = [];
  const overdueByLm = new Map<string, LmTaskFact[]>();
  for (const f of facts) {
    if (!f.overdue) continue;
    overdueByLm.set(f.lmId, [...(overdueByLm.get(f.lmId) ?? []), f]);
    const rules: MajorFlagRule[] = [];
    if (f.daysOverdue > MAJOR_FLAG.taskOverdueDays) rules.push("TASK_OVERDUE");
    const daysToStart = (f.startDate.getTime() - now.getTime()) / DAY;
    if (f.taskKey === DAY0_TASK_KEY && daysToStart <= MAJOR_FLAG.day0WindowDays) rules.push("DAY0_NEAR_START");
    if (!rules.length) continue;
    out.push({
      lmId: f.lmId,
      lmName: lmNames.get(f.lmId) ?? "Unknown",
      teamName: f.teamName,
      area: f.area,
      journeyId: f.journeyId,
      starterName: f.starterName,
      taskKey: f.taskKey,
      title: f.title,
      daysOverdue: f.daysOverdue,
      rules,
      detail: rules.includes("DAY0_NEAR_START")
        ? `${f.daysOverdue} days overdue, start ${daysToStart < 0 ? "passed" : `in ${Math.max(0, Math.ceil(daysToStart))} ${Math.ceil(daysToStart) === 1 ? "day" : "days"}`}`
        : `${f.daysOverdue} days overdue`,
    });
  }
  for (const [lmId, list] of overdueByLm) {
    if (list.length <= MAJOR_FLAG.manyOverdue) continue;
    out.push({
      lmId,
      lmName: lmNames.get(lmId) ?? "Unknown",
      teamName: list[0].teamName,
      area: list[0].area,
      journeyId: null,
      starterName: null,
      taskKey: null,
      title: null,
      daysOverdue: Math.max(...list.map((f) => f.daysOverdue)),
      rules: ["MANY_OVERDUE"],
      detail: `${list.length} overdue actions across ${new Set(list.map((f) => f.journeyId)).size} starters`,
    });
  }
  return out.sort((a, b) => b.rules.length - a.rules.length || b.daysOverdue - a.daysOverdue || a.lmName.localeCompare(b.lmName));
}

export interface ChaseStat {
  last: Date | null;
  count: number;
}

export interface LmLeagueRow {
  lmId: string;
  lmName: string;
  teams: string[];
  areas: string[];
  activeStarters: number;
  openActions: number;
  overdueActions: number;
  avgDaysOverdue: number | null;
  /** % of finished-or-overdue LM actions that were completed by their due date. Null with no such actions. */
  onTimePct: number | null;
  oldestOverdue: { title: string; starterName: string; days: number } | null;
  /** Every overdue action, oldest first (the chase confirmation lists them). */
  overdueItems: { journeyId: string; taskKey: string; title: string; starterName: string; days: number }[];
  lastChasedAt: string | null;
  chaseCount: number;
  canChase: boolean;
  blockedUntil: string | null;
  flagRules: MajorFlagRule[];
  flagCount: number;
}

/** Done on time: completed on or before the due date. */
const onTime = (f: LmTaskFact) => f.done && !!f.completedAt && f.completedAt.getTime() <= f.dueDate.getTime();

export function chaseSuppressed(lastChasedAt: Date | null, now: Date): boolean {
  return !!lastChasedAt && now.getTime() - lastChasedAt.getTime() < CHASE_COOLDOWN_MS;
}

function aggregate(facts: LmTaskFact[]) {
  const overdue = facts.filter((f) => f.overdue);
  const base = facts.filter((f) => f.done || f.overdue);
  return {
    open: facts.filter((f) => f.open).length,
    overdue: overdue.length,
    avgDaysOverdue: avg(overdue.map((f) => f.daysOverdue)),
    onTimePct: base.length ? pct(base.filter(onTime).length, base.length) : null,
    oldest: overdue.length ? overdue.reduce((a, b) => (b.daysOverdue > a.daysOverdue ? b : a)) : null,
  };
}

/** League table: one row per LM, worst first (flags, then overdue actions, then average days overdue). */
export function buildLmLeague(
  facts: LmTaskFact[],
  journeys: Pick<JourneyState, "lmId" | "status">[],
  lmNames: Map<string, string>,
  flags: MajorFlag[],
  chases: Map<string, ChaseStat>,
  now: Date,
): LmLeagueRow[] {
  const lmIds = new Set<string>([...facts.map((f) => f.lmId), ...journeys.filter((j) => j.status === "active").map((j) => j.lmId)]);
  const rows: LmLeagueRow[] = [];
  for (const lmId of lmIds) {
    const mine = facts.filter((f) => f.lmId === lmId);
    const a = aggregate(mine);
    const myFlags = flags.filter((f) => f.lmId === lmId);
    const c = chases.get(lmId) ?? { last: null, count: 0 };
    const suppressed = chaseSuppressed(c.last, now);
    rows.push({
      lmId,
      lmName: lmNames.get(lmId) ?? "Unknown",
      teams: [...new Set(mine.map((f) => f.teamName))].sort(),
      areas: [...new Set(mine.map((f) => f.area).filter((x): x is string => !!x))].sort(),
      activeStarters: journeys.filter((j) => j.lmId === lmId && j.status === "active").length,
      openActions: a.open,
      overdueActions: a.overdue,
      avgDaysOverdue: a.avgDaysOverdue,
      onTimePct: a.onTimePct,
      oldestOverdue: a.oldest ? { title: a.oldest.title, starterName: a.oldest.starterName, days: a.oldest.daysOverdue } : null,
      overdueItems: mine.filter((f) => f.overdue).sort((x, y) => y.daysOverdue - x.daysOverdue).map((f) => ({ journeyId: f.journeyId, taskKey: f.taskKey, title: f.title, starterName: f.starterName, days: f.daysOverdue })),
      lastChasedAt: c.last ? c.last.toISOString() : null,
      chaseCount: c.count,
      canChase: a.overdue > 0 && !suppressed,
      blockedUntil: suppressed && c.last ? new Date(c.last.getTime() + CHASE_COOLDOWN_MS).toISOString() : null,
      flagRules: [...new Set(myFlags.flatMap((f) => f.rules))],
      flagCount: myFlags.length,
    });
  }
  return rows.sort((a, b) => b.flagCount - a.flagCount || b.overdueActions - a.overdueActions || (b.avgDaysOverdue ?? 0) - (a.avgDaysOverdue ?? 0) || a.lmName.localeCompare(b.lmName));
}

export interface LmRollupRow {
  key: string;
  label: string;
  lms: number;
  openActions: number;
  overdueActions: number;
  avgDaysOverdue: number | null;
  onTimePct: number | null;
  flagCount: number;
}

/** Roll the same facts up per team or per business area. */
export function buildLmRollup(facts: LmTaskFact[], flags: MajorFlag[], by: "team" | "area"): LmRollupRow[] {
  const keyOf = (f: { teamName: string; area: string | null }) => (by === "team" ? f.teamName : (f.area ?? "No business area"));
  const groups = new Map<string, LmTaskFact[]>();
  for (const f of facts) groups.set(keyOf(f), [...(groups.get(keyOf(f)) ?? []), f]);
  return [...groups.entries()]
    .map(([key, list]) => {
      const a = aggregate(list);
      return {
        key,
        label: key,
        lms: new Set(list.map((f) => f.lmId)).size,
        openActions: a.open,
        overdueActions: a.overdue,
        avgDaysOverdue: a.avgDaysOverdue,
        onTimePct: a.onTimePct,
        flagCount: flags.filter((f) => keyOf(f) === key).length,
      };
    })
    .sort((a, b) => b.overdueActions - a.overdueActions || b.flagCount - a.flagCount || a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------- attrition

export interface ExitFact {
  journeyId: string;
  starterName: string;
  stage: string | null;
  reason: string | null;
  reasonSource: "COLLEAGUE" | "PNP" | null;
  exitedAt: Date | null;
  startDate: Date;
  teamId: string;
  teamName: string;
  area: string | null;
}

/** Whole days from exit to start date: positive before the start, negative after. */
export const exitLeadDays = (e: Pick<ExitFact, "exitedAt" | "startDate">): number | null =>
  e.exitedAt ? Math.ceil((e.startDate.getTime() - e.exitedAt.getTime()) / DAY) : null;

export const monthKey = (d: Date): string => d.toISOString().slice(0, 7);

export interface AttritionReport {
  starters: number;
  exits: number;
  exitRatePct: number;
  monthly: { month: string; offers: number; exits: number; cohortExits: number; cohortRatePct: number }[];
  byStage: { stage: Stage; reached: number; exits: number; ratePct: number }[];
  byReason: { key: string; colleague: number; pnp: number; unknown: number; total: number }[];
  byTeam: { key: string; label: string; area: string | null; starters: number; exits: number; ratePct: number }[];
  byArea: { key: string; label: string; starters: number; exits: number; ratePct: number }[];
  byLeadTime: { key: string; label: string; exits: number }[];
}

/**
 * Attrition (exit rate = exits / starters whose offer was accepted, i.e. every journey in view).
 * Stage rate = exits at that stage / journeys that reached the stage (from the funnel's "reached").
 * Monthly: offers accepted and exits in the month, plus the cohort rate (of those offered that month,
 * the share that have exited so far).
 */
export function buildAttrition(
  journeys: { id: string; status: string }[],
  meta: Map<string, JourneyMeta>,
  exits: ExitFact[],
  reached: Map<Stage, number>,
  now: Date,
): AttritionReport {
  const starters = journeys.length;
  const exitIds = new Set(exits.map((e) => e.journeyId));

  const months = new Set<string>([monthKey(now)]);
  for (const j of journeys) { const m = meta.get(j.id); if (m) months.add(monthKey(m.createdAt)); }
  for (const e of exits) if (e.exitedAt) months.add(monthKey(e.exitedAt));
  const monthly = [...months].sort().slice(-12).map((month) => {
    const cohort = journeys.filter((j) => meta.get(j.id) && monthKey(meta.get(j.id)!.createdAt) === month);
    const cohortExits = cohort.filter((j) => exitIds.has(j.id)).length;
    return {
      month,
      offers: cohort.length,
      exits: exits.filter((e) => e.exitedAt && monthKey(e.exitedAt) === month).length,
      cohortExits,
      cohortRatePct: pct(cohortExits, cohort.length),
    };
  });

  const byStage = STAGES.map((stage) => {
    const n = exits.filter((e) => e.stage === stage).length;
    const r = reached.get(stage) ?? 0;
    return { stage, reached: r, exits: n, ratePct: pct(n, r) };
  });

  const reasons = new Map<string, { colleague: number; pnp: number; unknown: number }>();
  for (const e of exits) {
    const k = e.reason ?? "Not recorded";
    const row = reasons.get(k) ?? { colleague: 0, pnp: 0, unknown: 0 };
    if (e.reasonSource === "COLLEAGUE") row.colleague++;
    else if (e.reasonSource === "PNP") row.pnp++;
    else row.unknown++;
    reasons.set(k, row);
  }
  const byReason = [...reasons.entries()]
    .map(([key, v]) => ({ key, ...v, total: v.colleague + v.pnp + v.unknown }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));

  const startersBy = (keyOf: (m: JourneyMeta) => string) => {
    const m = new Map<string, number>();
    for (const j of journeys) { const mm = meta.get(j.id); if (mm) m.set(keyOf(mm), (m.get(keyOf(mm)) ?? 0) + 1); }
    return m;
  };
  const teamStarters = startersBy((m) => m.teamName);
  const areaStarters = startersBy((m) => m.area ?? "No business area");
  const byTeam = [...teamStarters.entries()]
    .map(([label, n]) => {
      const mine = exits.filter((e) => e.teamName === label);
      return { key: label, label, area: mine[0]?.area ?? [...meta.values()].find((m) => m.teamName === label)?.area ?? null, starters: n, exits: mine.length, ratePct: pct(mine.length, n) };
    })
    .sort((a, b) => b.ratePct - a.ratePct || b.exits - a.exits || a.label.localeCompare(b.label));
  const byArea = [...areaStarters.entries()]
    .map(([label, n]) => {
      const c = exits.filter((e) => (e.area ?? "No business area") === label).length;
      return { key: label, label, starters: n, exits: c, ratePct: pct(c, n) };
    })
    .sort((a, b) => b.ratePct - a.ratePct || b.exits - a.exits || a.label.localeCompare(b.label));

  const byLeadTime = LEAD_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    exits: exits.filter((e) => { const d = exitLeadDays(e); return d !== null && b.test(d); }).length,
  }));

  return { starters, exits: exits.length, exitRatePct: pct(exits.length, starters), monthly, byStage, byReason, byTeam, byArea, byLeadTime };
}

// ------------------------------------------------------------ early warning

export interface EarlySignal {
  kind: EarlySignalKind;
  detail: string;
}

export interface EarlyWarningRow {
  journeyId: string;
  starterName: string;
  teamName: string;
  lmName: string;
  stage: Stage;
  startDate: string;
  daysToStart: number;
  signals: EarlySignal[];
  /** HIGH: two or more signals. WATCH: one. */
  level: "HIGH" | "WATCH";
}

export interface EarlyWarningInput {
  journeys: JourneyState[];
  names: Map<string, string>;
  meta: Map<string, JourneyMeta>;
  /** When First Advantage started waiting on the starter, for journeys currently in "action needed". */
  vettingActionSince: Map<string, Date>;
  /** Latest starter-driven event per journey (task completions by the starter). */
  starterActivity: Map<string, Date>;
  now: Date;
}

/**
 * Active starters showing at least one risk signal (rules in EARLY_SIGNAL_RULES). Day 0 is "not arranged" when
 * the LM's propose-Day-0 action is not done (even if it is still locked).
 */
export function buildEarlyWarning(i: EarlyWarningInput): EarlyWarningRow[] {
  const out: EarlyWarningRow[] = [];
  for (const j of i.journeys) {
    if (j.status !== "active") continue;
    const signals: EarlySignal[] = [];
    const since = i.vettingActionSince.get(j.id);
    if (since) {
      const d = daysBetween(i.now, since);
      if (d > EARLY_WARNING.vettingActionDays) signals.push({ kind: "VETTING_ACTION", detail: `Waiting on the starter for ${d} days` });
    }
    if (j.currentStage !== "DAY_30") {
      const last = i.starterActivity.get(j.id) ?? i.meta.get(j.id)?.createdAt;
      if (last) {
        const d = daysBetween(i.now, last);
        if (d > EARLY_WARNING.starterQuietDays) signals.push({ kind: "STARTER_QUIET", detail: `Nothing done for ${d} days` });
      }
    }
    const lmOverdue = j.tasks.filter((t) => t.owner === "LM" && isOverdue(t, i.now, j.tasks));
    if (lmOverdue.length) signals.push({ kind: "LM_OVERDUE", detail: `${lmOverdue.length} LM action${lmOverdue.length === 1 ? "" : "s"} overdue` });
    const day0 = j.tasks.find((t) => t.key === DAY0_TASK_KEY && t.applicable);
    const daysToStart = Math.ceil((j.startDate.getTime() - i.now.getTime()) / DAY);
    if (day0 && day0.status !== "DONE" && !isEffectivelyDone(day0, j.tasks) && daysToStart <= EARLY_WARNING.day0Days && j.currentStage !== "DAY_30") {
      signals.push({ kind: "DAY0_NOT_ARRANGED", detail: daysToStart >= 0 ? `Starts in ${daysToStart} day${daysToStart === 1 ? "" : "s"}` : `Started ${-daysToStart} day${daysToStart === -1 ? "" : "s"} ago` });
    }
    if (!signals.length) continue;
    out.push({
      journeyId: j.id,
      starterName: i.names.get(j.starterId) ?? "Unknown",
      teamName: i.meta.get(j.id)?.teamName ?? j.teamId,
      lmName: i.names.get(j.lmId) ?? "Unknown",
      stage: j.currentStage,
      startDate: j.startDate.toISOString(),
      daysToStart,
      signals,
      level: signals.length >= 2 ? "HIGH" : "WATCH",
    });
  }
  return out.sort((a, b) => b.signals.length - a.signals.length || a.daysToStart - b.daysToStart || a.starterName.localeCompare(b.starterName));
}

// -------------------------------------------------------------- bottlenecks

export interface TaskBottleneck {
  key: string;
  title: string;
  owner: string;
  stage: Stage;
  /** Journeys where the task applies (active, or finished). */
  journeys: number;
  overdueNow: number;
  blockedNow: number;
  /** Completed after the due date. */
  lateDone: number;
  affected: number;
  affectedPct: number;
}

/**
 * Top tasks (by template key) most often overdue or blocked: still overdue now, blocked now, or completed after
 * the due date. Blocked wins over overdue so one task is never counted twice. Ties break on the affected share.
 */
export function buildTaskBottlenecks(journeys: JourneyState[], now: Date, limit = 10): TaskBottleneck[] {
  const m = new Map<string, TaskBottleneck>();
  for (const j of journeys) {
    for (const t of j.tasks) {
      if (!t.applicable || t.optional) continue;
      const done = t.status === "DONE" || isEffectivelyDone(t, j.tasks);
      const active = j.status === "active";
      if (!done && !active) continue;
      const row = m.get(t.key) ?? { key: t.key, title: t.title, owner: t.owner, stage: t.stage, journeys: 0, overdueNow: 0, blockedNow: 0, lateDone: 0, affected: 0, affectedPct: 0 };
      row.journeys++;
      if (done) {
        if (t.completedAt && t.completedAt.getTime() > t.dueDate.getTime()) row.lateDone++;
      } else if (t.status === "BLOCKED") row.blockedNow++;
      else if (isOverdue(t, now, j.tasks)) row.overdueNow++;
      m.set(t.key, row);
    }
  }
  return [...m.values()]
    .map((r) => ({ ...r, affected: r.overdueNow + r.blockedNow + r.lateDone, affectedPct: pct(r.overdueNow + r.blockedNow + r.lateDone, r.journeys) }))
    .filter((r) => r.affected > 0)
    .sort((a, b) => b.affected - a.affected || b.affectedPct - a.affectedPct || a.title.localeCompare(b.title))
    .slice(0, limit);
}

// ------------------------------------------------------------------ vetting

export interface VettingReport {
  cleared: number;
  medianDays: number | null;
  p90Days: number | null;
  avgDays: number | null;
  /** Share of cleared vettings that spent time in "action needed". */
  withActionNeeded: { count: number; pct: number };
  avgActionNeededDays: number | null;
  inFlight: { journeyId: string; starterName: string; teamName: string; waitingDays: number; actionNeededDays: number | null }[];
}

const normalized = (e: StageEvent): string | null => ((e.data as { normalized?: string } | null | undefined)?.normalized ?? null);
const isFa = (e: StageEvent) => e.type === "INTEGRATION_STATUS" && e.entityId === "firstadvantage";

/**
 * Vetting duration: from the journey entering vetting (the First Advantage request, D10) to the first
 * First Advantage "cleared" event. Action-needed time is summed over each spell until the next status event
 * (or until `now` while still open). In flight = active journeys currently at the vetting stage.
 */
export function buildVetting(events: StageEvent[], journeys: JourneyState[], names: Map<string, string>, meta: Map<string, JourneyMeta>, now: Date): VettingReport {
  const byJ = new Map<string, StageEvent[]>();
  for (const e of events) {
    if (!e.journeyId) continue;
    if (!(isFa(e) || e.type === "STAGE_CHANGED" || e.type === "JOURNEY_CREATED")) continue;
    byJ.set(e.journeyId, [...(byJ.get(e.journeyId) ?? []), e]);
  }
  const durations: number[] = [];
  const actionDays: number[] = [];
  let withAction = 0;
  const inFlight: VettingReport["inFlight"] = [];
  const spells = (list: StageEvent[], until: Date): number => {
    let total = 0;
    const fa = list.filter(isFa);
    fa.forEach((e, idx) => {
      if (normalized(e) !== "ACTION_NEEDED") return;
      const end = fa[idx + 1]?.createdAt ?? until;
      total += Math.max(0, end.getTime() - e.createdAt.getTime()) / DAY;
    });
    return total;
  };
  for (const j of journeys) {
    const list = (byJ.get(j.id) ?? []).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const pev = list.find((e) => e.type === "STAGE_CHANGED" && e.to === "PEV")?.createdAt ?? list.find(isFa)?.createdAt;
    const cleared = list.find((e) => isFa(e) && normalized(e) === "COMPLETE")?.createdAt;
    if (pev && cleared) {
      durations.push(Math.max(0, (cleared.getTime() - pev.getTime()) / DAY));
      const a = spells(list, cleared);
      if (list.some((e) => isFa(e) && normalized(e) === "ACTION_NEEDED")) { withAction++; actionDays.push(a); }
    } else if (j.status === "active" && j.currentStage === "PEV") {
      const start = pev ?? meta.get(j.id)?.createdAt ?? now;
      const hasAction = list.some((e) => isFa(e) && normalized(e) === "ACTION_NEEDED");
      inFlight.push({
        journeyId: j.id,
        starterName: names.get(j.starterId) ?? "Unknown",
        teamName: meta.get(j.id)?.teamName ?? j.teamId,
        waitingDays: Math.max(0, daysBetween(now, start)),
        actionNeededDays: hasAction ? round1(spells(list, now)) : null,
      });
    }
  }
  const p50 = median(durations);
  const p90 = percentile(durations, 90);
  return {
    cleared: durations.length,
    medianDays: p50 === null ? null : round1(p50),
    p90Days: p90 === null ? null : round1(p90),
    avgDays: avg(durations),
    withActionNeeded: { count: withAction, pct: pct(withAction, durations.length) },
    avgActionNeededDays: avg(actionDays),
    inFlight: inFlight.sort((a, b) => b.waitingDays - a.waitingDays),
  };
}

// ------------------------------------------------------------ intake outlook

export const OUTLOOK_WEEKS = 13;

/** Monday 00:00 UTC of the week containing `d`. */
export function weekStartUtc(d: Date): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - dow * DAY);
}

const PRE_START: readonly Stage[] = ["CONDITIONAL_OFFER", "PEV", "UNCONDITIONAL_OFFER"];

/** Pre-start gating tasks: applicable, gating, non-optional, in the stages before Day 0. */
export function readiness(tasks: TaskState[]): { done: number; total: number; pct: number } {
  const gating = tasks.filter((t) => t.applicable && t.gating && !t.optional && PRE_START.includes(t.stage));
  const done = gating.filter((t) => t.status === "DONE" || isEffectivelyDone(t, tasks)).length;
  return { done, total: gating.length, pct: gating.length ? pct(done, gating.length) : 100 };
}

export interface IntakeStarter {
  journeyId: string;
  starterName: string;
  teamName: string;
  lmName: string;
  stage: Stage;
  startDate: string;
  daysToStart: number;
  done: number;
  total: number;
  readinessPct: number;
  behind: boolean;
}

export interface IntakeWeek {
  weekStart: string;
  starters: number;
  done: number;
  total: number;
  readinessPct: number | null;
  behind: number;
}

export interface IntakeOutlook {
  weeks: IntakeWeek[];
  starters: IntakeStarter[];
  totalStarters: number;
  readinessPct: number | null;
}

/** Active starters starting today or later, bucketed into the next 13 Monday-based weeks, with pooled readiness. */
export function buildIntake(journeys: JourneyState[], names: Map<string, string>, meta: Map<string, JourneyMeta>, now: Date, weeks = OUTLOOK_WEEKS): IntakeOutlook {
  const first = weekStartUtc(now);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = first.getTime() + weeks * 7 * DAY;
  const starters: IntakeStarter[] = [];
  for (const j of journeys) {
    if (j.status !== "active") continue;
    const s = j.startDate.getTime();
    if (s < today.getTime() || s >= end) continue;
    const r = readiness(j.tasks);
    const daysToStart = Math.ceil((s - now.getTime()) / DAY);
    starters.push({
      journeyId: j.id,
      starterName: names.get(j.starterId) ?? "Unknown",
      teamName: meta.get(j.id)?.teamName ?? j.teamId,
      lmName: names.get(j.lmId) ?? "Unknown",
      stage: j.currentStage,
      startDate: j.startDate.toISOString(),
      daysToStart,
      done: r.done,
      total: r.total,
      readinessPct: r.pct,
      behind: daysToStart <= READINESS.behindWithinDays && r.pct < READINESS.behindBelowPct,
    });
  }
  starters.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.starterName.localeCompare(b.starterName));
  const rows: IntakeWeek[] = Array.from({ length: weeks }, (_, w) => {
    const ws = first.getTime() + w * 7 * DAY;
    const mine = starters.filter((s) => { const t = Date.parse(s.startDate); return t >= ws && t < ws + 7 * DAY; });
    const done = mine.reduce((a, s) => a + s.done, 0);
    const total = mine.reduce((a, s) => a + s.total, 0);
    return { weekStart: new Date(ws).toISOString().slice(0, 10), starters: mine.length, done, total, readinessPct: mine.length ? (total ? pct(done, total) : 100) : null, behind: mine.filter((s) => s.behind).length };
  });
  const done = starters.reduce((a, s) => a + s.done, 0);
  const total = starters.reduce((a, s) => a + s.total, 0);
  return { weeks: rows, starters, totalStarters: starters.length, readinessPct: starters.length ? (total ? pct(done, total) : 100) : null };
}
