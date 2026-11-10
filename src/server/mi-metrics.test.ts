import { describe, expect, it } from "vitest";
import {
  buildAttrition,
  buildEarlyWarning,
  buildIntake,
  buildLmLeague,
  buildLmRollup,
  buildMajorFlags,
  buildTaskBottlenecks,
  buildVetting,
  exitLeadDays,
  lmTaskFacts,
  median,
  percentile,
  readiness,
  weekStartUtc,
  type ExitFact,
  type JourneyMeta,
  type StageEvent,
} from "./mi-metrics";
import { vettingActionSince } from "./mi-service";
import type { JourneyState, TaskState, Stage } from "@/domain/types";

const NOW = new Date("2026-11-10T12:00:00Z"); // a Tuesday
const D = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * D);
const ahead = (d: number) => ago(-d);

const task = (o: Partial<TaskState> & { key: string }): TaskState => ({
  id: o.key, templateId: null, title: o.key, description: "", stage: "UNCONDITIONAL_OFFER", owner: "LM", type: "ACTION", status: "TODO",
  dueDate: ahead(5), completedAt: null, blockedReason: null, evidence: null, dependsOn: [], source: "CORE", adapterKey: null,
  gating: false, contentSlug: null, condition: null, applicable: true, sortOrder: 0, ...o,
});
const journey = (id: string, tasks: TaskState[], o: Partial<JourneyState> = {}): JourneyState => ({
  id, starterId: `s-${id}`, lmId: "lm1", buddyId: null, teamId: "t1", startDate: ahead(20), currentStage: "UNCONDITIONAL_OFFER", status: "active",
  exitReason: null, exitStage: null, completedAt: null, flagged: false, flagReason: null, tasks, ...o,
});
const meta = (ids: string[], o: Partial<JourneyMeta> = {}) =>
  new Map<string, JourneyMeta>(ids.map((id) => [id, { teamId: "t1", teamName: "Team One", area: "Area A", createdAt: ago(30), ...o }]));
const names = new Map([["lm1", "Pat LM"], ["lm2", "Sam LM"], ["s-a", "Ann"], ["s-b", "Bob"], ["s-c", "Cat"], ["s-d", "Dan"]]);

describe("percentile and median", () => {
  it("interpolates linearly between ranks", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 90)).toBe(46);
    expect(percentile([5], 90)).toBe(5);
    expect(percentile([], 90)).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
  });
  it("is not changed by input order and clamps p", () => {
    expect(percentile([4, 1, 3, 2], 100)).toBe(4);
    expect(percentile([4, 1, 3, 2], 150)).toBe(4);
    expect(percentile([4, 1, 3, 2], 0)).toBe(1);
  });
});

describe("LM league, flags and rollups", () => {
  // lm1: Ann has Day 0 overdue 8d (start in 3d) + a 2d overdue + a locked one + an optional; Bob has 3 more overdue (so lm1 has 5 > 3).
  const ann = journey("a", [
    task({ key: "propose-day-0-arrangements", dueDate: ago(8) }),
    task({ key: "lm-team-checklist", dueDate: ago(2) }),
    task({ key: "locked-lm", status: "LOCKED", dueDate: ago(30) }),
    task({ key: "optional-lm", optional: true, dueDate: ago(30) }),
    task({ key: "starter-task", owner: "STARTER", dueDate: ago(30) }),
    task({ key: "done-on-time", status: "DONE", dueDate: ago(10), completedAt: ago(11) }),
    task({ key: "done-late", status: "DONE", dueDate: ago(10), completedAt: ago(7) }),
  ], { startDate: ahead(3) });
  const bob = journey("b", [
    task({ key: "x1", dueDate: ago(1) }),
    task({ key: "x2", dueDate: ago(1) }),
    task({ key: "x3", dueDate: ago(6) }),
  ], { starterId: "s-b" });
  // lm2: one task overdue 3 days only.
  const cat = journey("c", [task({ key: "y1", dueDate: ago(3) })], { starterId: "s-c", lmId: "lm2", teamId: "t2" });
  // Not active: unfinished tasks are ignored, done ones count for on-time.
  const dan = journey("d", [
    task({ key: "z1", dueDate: ago(50) }),
    task({ key: "z2", status: "DONE", dueDate: ago(40), completedAt: ago(40) }),
  ], { starterId: "s-d", status: "exited", lmId: "lm2", teamId: "t2" });
  const all = [ann, bob, cat, dan];
  const m = new Map<string, JourneyMeta>([
    ...meta(["a", "b"]),
    ...meta(["c", "d"], { teamId: "t2", teamName: "Team Two", area: "Area B" }),
  ]);
  const facts = lmTaskFacts(all, names, m, NOW);
  const lmNames = new Map([["lm1", "Pat LM"], ["lm2", "Sam LM"]]);
  const flags = buildMajorFlags(facts, lmNames, NOW);
  const chases = new Map([["lm1", { last: ago(0.5), count: 3 }], ["lm2", { last: ago(2), count: 1 }]]);
  const league = buildLmLeague(facts, all, lmNames, flags, chases, NOW);
  const row = (id: string) => league.find((r) => r.lmId === id)!;

  it("uses the D3 overdue rule: skips locked, optional, non-LM and inactive-journey unfinished tasks", () => {
    expect(facts.filter((f) => f.overdue).map((f) => f.taskKey).sort()).toEqual(["lm-team-checklist", "propose-day-0-arrangements", "x1", "x2", "x3", "y1"]);
    expect(facts.find((f) => f.taskKey === "z1")).toBeUndefined();
    expect(facts.find((f) => f.taskKey === "locked-lm")!.open).toBe(false);
    expect(facts.find((f) => f.taskKey === "optional-lm")).toBeUndefined();
  });

  it("computes open, overdue, average days overdue and oldest per LM", () => {
    const l1 = row("lm1");
    expect(l1.overdueActions).toBe(5);
    expect(l1.openActions).toBe(5);
    expect(l1.avgDaysOverdue).toBe(3.6); // (8 + 2 + 1 + 1 + 6) / 5, each at least 1 day
    expect(l1.oldestOverdue).toEqual({ title: "propose-day-0-arrangements", starterName: "Ann", days: 8 });
    expect(l1.activeStarters).toBe(2);
    expect(row("lm2").overdueActions).toBe(1);
    expect(row("lm2").activeStarters).toBe(1);
  });

  it("computes the on-time share over done-or-overdue actions, completed journeys included", () => {
    // lm1: done on time 1, done late 1, overdue 5 -> 1 of 7
    expect(row("lm1").onTimePct).toBe(14);
    // lm2: done on time 1 (exited journey), overdue 1 -> 1 of 2
    expect(row("lm2").onTimePct).toBe(50);
  });

  it("flags tasks over 5 days, LMs with more than 3 overdue, and Day 0 near the start", () => {
    const byTask = (k: string) => flags.find((f) => f.taskKey === k);
    expect(byTask("propose-day-0-arrangements")!.rules).toEqual(["TASK_OVERDUE", "DAY0_NEAR_START"]);
    expect(byTask("x3")!.rules).toEqual(["TASK_OVERDUE"]); // 6 days
    expect(byTask("lm-team-checklist")).toBeUndefined(); // 2 days, not Day 0
    expect(byTask("y1")).toBeUndefined(); // 3 days
    const many = flags.filter((f) => f.rules.includes("MANY_OVERDUE"));
    expect(many).toHaveLength(1);
    expect(many[0].lmId).toBe("lm1");
    expect(many[0].journeyId).toBeNull();
    expect(row("lm1").flagRules.sort()).toEqual(["DAY0_NEAR_START", "MANY_OVERDUE", "TASK_OVERDUE"]);
    expect(row("lm2").flagCount).toBe(0);
  });

  it("does not flag exactly 5 days overdue or exactly 3 overdue actions", () => {
    const j = journey("e", [task({ key: "a1", dueDate: ago(5) }), task({ key: "a2", dueDate: ago(5) }), task({ key: "a3", dueDate: ago(4) })]);
    const f = buildMajorFlags(lmTaskFacts([j], names, meta(["e"]), NOW), lmNames, NOW);
    expect(f).toEqual([]);
  });

  it("does not raise the Day 0 flag when the start date is more than 5 days away, but does after it passed", () => {
    const far = journey("f", [task({ key: "propose-day-0-arrangements", dueDate: ago(1) })], { startDate: ahead(9) });
    expect(buildMajorFlags(lmTaskFacts([far], names, meta(["f"]), NOW), lmNames, NOW)).toEqual([]);
    const past = journey("g", [task({ key: "propose-day-0-arrangements", dueDate: ago(1) })], { startDate: ago(2) });
    const f = buildMajorFlags(lmTaskFacts([past], names, meta(["g"]), NOW), lmNames, NOW);
    expect(f[0].rules).toEqual(["DAY0_NEAR_START"]);
    expect(f[0].detail).toContain("passed");
  });

  it("ranks worst first and applies the 24h chase suppression", () => {
    expect(league.map((r) => r.lmId)).toEqual(["lm1", "lm2"]);
    expect(row("lm1").canChase).toBe(false);
    expect(row("lm1").blockedUntil).toBe(new Date(ago(0.5).getTime() + D).toISOString());
    expect(row("lm1").chaseCount).toBe(3);
    expect(row("lm2").canChase).toBe(true);
    expect(row("lm2").overdueItems).toHaveLength(1);
  });

  it("rolls the same facts up by team and by area", () => {
    const teams = buildLmRollup(facts, flags, "team");
    expect(teams.map((t) => [t.key, t.overdueActions, t.flagCount])).toEqual([["Team One", 5, 3], ["Team Two", 1, 0]]);
    const areas = buildLmRollup(facts, flags, "area");
    expect(areas.map((a) => [a.key, a.lms, a.onTimePct])).toEqual([["Area A", 1, 14], ["Area B", 1, 50]]);
  });
});

describe("attrition", () => {
  const ex = (id: string, o: Partial<ExitFact> = {}): ExitFact => ({
    journeyId: id, starterName: id, stage: "PEV", reason: "ROLE_NOT_RIGHT", reasonSource: "COLLEAGUE", exitedAt: ago(10), startDate: ahead(10),
    teamId: "t1", teamName: "Team One", area: "Area A", ...o,
  });
  const js = ["a", "b", "c", "d", "e"].map((id) => ({ id, status: id === "e" ? "active" : "exited" }));
  const m = new Map<string, JourneyMeta>([
    ["a", { teamId: "t1", teamName: "Team One", area: "Area A", createdAt: new Date("2026-09-05T00:00:00Z") }],
    ["b", { teamId: "t1", teamName: "Team One", area: "Area A", createdAt: new Date("2026-09-20T00:00:00Z") }],
    ["c", { teamId: "t2", teamName: "Team Two", area: "Area B", createdAt: new Date("2026-10-02T00:00:00Z") }],
    ["d", { teamId: "t2", teamName: "Team Two", area: "Area B", createdAt: new Date("2026-10-15T00:00:00Z") }],
    ["e", { teamId: "t2", teamName: "Team Two", area: "Area B", createdAt: new Date("2026-10-20T00:00:00Z") }],
  ]);
  const exits = [
    ex("a", { stage: "CONDITIONAL_OFFER", exitedAt: new Date("2026-09-25T00:00:00Z"), startDate: new Date("2026-10-30T00:00:00Z") }), // 35 days before
    ex("b", { stage: "PEV", reason: "FAILED_PEV", reasonSource: "PNP", exitedAt: new Date("2026-10-05T00:00:00Z"), startDate: new Date("2026-10-12T00:00:00Z") }), // 7
    ex("c", { stage: "PEV", reason: "NO_SHOW", reasonSource: "PNP", exitedAt: new Date("2026-10-20T00:00:00Z"), startDate: new Date("2026-10-18T00:00:00Z"), teamId: "t2", teamName: "Team Two", area: "Area B" }), // after
    ex("d", { stage: "DAY_0", reason: null, reasonSource: null, exitedAt: new Date("2026-11-02T00:00:00Z"), startDate: new Date("2026-11-20T00:00:00Z"), teamId: "t2", teamName: "Team Two", area: "Area B" }), // 18
  ];
  const reached = new Map<Stage, number>([["CONDITIONAL_OFFER", 5], ["PEV", 4], ["UNCONDITIONAL_OFFER", 3], ["DAY_0", 2], ["DAY_30", 0]]);
  const r = buildAttrition(js, m, exits, reached, NOW);

  it("computes the overall exit rate", () => {
    expect(r.starters).toBe(5);
    expect(r.exits).toBe(4);
    expect(r.exitRatePct).toBe(80);
  });

  it("computes exit rate by stage over those who reached it", () => {
    expect(r.byStage.map((s) => [s.stage, s.exits, s.reached, s.ratePct])).toEqual([
      ["CONDITIONAL_OFFER", 1, 5, 20], ["PEV", 2, 4, 50], ["UNCONDITIONAL_OFFER", 0, 3, 0], ["DAY_0", 1, 2, 50], ["DAY_30", 0, 0, 0],
    ]);
  });

  it("splits reasons by who supplied them, keeping unknown source and missing reason visible", () => {
    const by = (k: string) => r.byReason.find((x) => x.key === k)!;
    expect(by("ROLE_NOT_RIGHT")).toMatchObject({ colleague: 1, pnp: 0, total: 1 });
    expect(by("FAILED_PEV")).toMatchObject({ colleague: 0, pnp: 1 });
    expect(by("Not recorded")).toMatchObject({ unknown: 1 });
  });

  it("computes monthly exits, offers and cohort rate", () => {
    const sep = r.monthly.find((x) => x.month === "2026-09")!;
    expect(sep).toMatchObject({ offers: 2, exits: 1, cohortExits: 2, cohortRatePct: 100 });
    const oct = r.monthly.find((x) => x.month === "2026-10")!;
    expect(oct).toMatchObject({ offers: 3, exits: 2, cohortExits: 2, cohortRatePct: 67 });
    expect(r.monthly[r.monthly.length - 1].month).toBe("2026-11");
  });

  it("computes exit rate by team and area", () => {
    expect(r.byTeam.map((t) => [t.label, t.exits, t.starters, t.ratePct])).toEqual([["Team One", 2, 2, 100], ["Team Two", 2, 3, 67]]);
    expect(r.byArea.map((t) => [t.label, t.ratePct])).toEqual([["Area A", 100], ["Area B", 67]]);
  });

  it("buckets exits by days before the start date", () => {
    expect(exitLeadDays(exits[2])).toBe(-2);
    const b = Object.fromEntries(r.byLeadTime.map((x) => [x.key, x.exits]));
    expect(b).toEqual({ after: 1, "0-7": 1, "8-14": 0, "15-30": 1, "31-60": 1, "60+": 0 });
  });

  it("handles no exits without dividing by zero", () => {
    const empty = buildAttrition([], new Map(), [], new Map(), NOW);
    expect(empty.exitRatePct).toBe(0);
    expect(empty.byStage.every((s) => s.ratePct === 0)).toBe(true);
  });
});

describe("early warning", () => {
  const base = (over: Partial<Parameters<typeof buildEarlyWarning>[0]> = {}) => ({
    journeys: [] as JourneyState[], names, meta: meta(["a", "b", "c"]), vettingActionSince: new Map<string, Date>(), starterActivity: new Map<string, Date>(), now: NOW, ...over,
  });
  const quiet = new Map([["a", ago(1)], ["b", ago(1)], ["c", ago(1)]]);

  it("raises each signal at its published threshold", () => {
    const a = journey("a", [], { startDate: ahead(30) });
    expect(buildEarlyWarning(base({ journeys: [a], starterActivity: quiet, vettingActionSince: new Map([["a", ago(3)]]) }))).toEqual([]); // exactly 3 days: not more than
    const v = buildEarlyWarning(base({ journeys: [a], starterActivity: quiet, vettingActionSince: new Map([["a", ago(4)]]) }));
    expect(v[0].signals.map((s) => s.kind)).toEqual(["VETTING_ACTION"]);
    expect(v[0].level).toBe("WATCH");
    expect(buildEarlyWarning(base({ journeys: [a], starterActivity: new Map([["a", ago(7)]]) }))).toEqual([]);
    expect(buildEarlyWarning(base({ journeys: [a], starterActivity: new Map([["a", ago(8)]]) }))[0].signals[0].kind).toBe("STARTER_QUIET");
  });

  it("falls back to the offer date when the starter has never acted, and ignores Day 30 and inactive journeys", () => {
    const a = journey("a", []);
    const b = journey("b", [], { currentStage: "DAY_30" });
    const c = journey("c", [], { status: "exited" });
    const out = buildEarlyWarning(base({ journeys: [a, b, c] }));
    expect(out.map((r) => r.journeyId)).toEqual(["a"]);
    expect(out[0].signals[0].detail).toContain("30 days");
  });

  it("raises LM overdue and Day 0 not arranged, and ranks by number of signals", () => {
    const risky = journey("a", [task({ key: "propose-day-0-arrangements", dueDate: ago(2), status: "TODO" })], { startDate: ahead(4) });
    const calm = journey("b", [task({ key: "z", dueDate: ago(1) })], { startDate: ahead(30), starterId: "s-b" });
    const out = buildEarlyWarning(base({ journeys: [calm, risky], starterActivity: quiet }));
    expect(out.map((r) => r.journeyId)).toEqual(["a", "b"]);
    expect(out[0].signals.map((s) => s.kind)).toEqual(["LM_OVERDUE", "DAY0_NOT_ARRANGED"]);
    expect(out[0].level).toBe("HIGH");
    expect(out[1].level).toBe("WATCH");
  });

  it("treats a locked Day 0 task as not arranged but a DONE one as arranged", () => {
    const locked = journey("a", [task({ key: "propose-day-0-arrangements", status: "LOCKED", dueDate: ago(2) })], { startDate: ahead(6) });
    expect(buildEarlyWarning(base({ journeys: [locked], starterActivity: quiet }))[0].signals.map((s) => s.kind)).toEqual(["DAY0_NOT_ARRANGED"]);
    const done = journey("a", [task({ key: "propose-day-0-arrangements", status: "DONE", dueDate: ago(2) })], { startDate: ahead(6) });
    expect(buildEarlyWarning(base({ journeys: [done], starterActivity: quiet }))).toEqual([]);
  });

  it("derives how long vetting has needed action from events, falling back to the state change", () => {
    const evs: StageEvent[] = [
      { journeyId: "a", type: "INTEGRATION_STATUS", entityId: "firstadvantage", from: null, to: "action_needed", createdAt: ago(9), data: { normalized: "ACTION_NEEDED" } },
      { journeyId: "a", type: "INTEGRATION_STATUS", entityId: "firstadvantage", from: null, to: "in_progress", createdAt: ago(6), data: { normalized: "IN_PROGRESS" } },
      { journeyId: "a", type: "INTEGRATION_STATUS", entityId: "firstadvantage", from: null, to: "action_needed", createdAt: ago(5), data: { normalized: "ACTION_NEEDED" } },
      { journeyId: "a", type: "INTEGRATION_STATUS", entityId: "firstadvantage", from: null, to: "action_needed", createdAt: ago(2), data: { normalized: "ACTION_NEEDED" } },
    ];
    const integ = new Map([["a|firstadvantage", { status: "action_needed", updatedAt: ago(1) }], ["b|firstadvantage", { status: "ACTION_NEEDED", updatedAt: ago(4) }], ["c|firstadvantage", { status: "in_progress", updatedAt: ago(4) }]]);
    const js = ["a", "b", "c"].map((id) => ({ id, status: "active" as const }));
    const m = vettingActionSince(js, integ, evs);
    expect(m.get("a")).toEqual(ago(5)); // the current unbroken spell began at the first action_needed after the last non-action status
    expect(m.get("b")).toEqual(ago(4));
    expect(m.has("c")).toBe(false);
  });
});

describe("task bottlenecks", () => {
  it("ranks templates by overdue, blocked and late completions without double counting", () => {
    const mk = (id: string, extra: TaskState[]) => journey(id, [
      task({ key: "t-a", title: "Task A", dueDate: ago(2) }),
      task({ key: "t-b", title: "Task B", status: "BLOCKED", dueDate: ago(2) }), // blocked wins over overdue
      task({ key: "t-c", title: "Task C", status: "DONE", dueDate: ago(5), completedAt: ago(1) }), // late
      ...extra,
    ]);
    const js = [mk("a", []), mk("b", []), mk("c", [task({ key: "t-d", title: "Task D", dueDate: ago(1) })]),
      journey("x", [task({ key: "t-a", title: "Task A", dueDate: ago(9) })], { status: "exited" })];
    const out = buildTaskBottlenecks(js, NOW);
    expect(out.map((r) => r.key)).toEqual(["t-a", "t-b", "t-c", "t-d"]); // 3, 3, 3 (tie broken by title), then 1
    const a = out.find((r) => r.key === "t-a")!;
    expect(a).toMatchObject({ overdueNow: 3, blockedNow: 0, lateDone: 0, journeys: 3, affected: 3, affectedPct: 100 }); // the exited journey's unfinished task is ignored
    expect(out.find((r) => r.key === "t-b")).toMatchObject({ blockedNow: 3, overdueNow: 0 });
    expect(out.find((r) => r.key === "t-c")).toMatchObject({ lateDone: 3 });
  });

  it("limits to 10 and drops tasks with no problems", () => {
    const tasks = Array.from({ length: 14 }, (_, i) => task({ key: `k${i}`, dueDate: ago(i + 1) }));
    const j = journey("a", [...tasks, task({ key: "fine", dueDate: ahead(3) })]);
    const out = buildTaskBottlenecks([j], NOW);
    expect(out).toHaveLength(10);
    expect(out.find((r) => r.key === "fine")).toBeUndefined();
  });
});

describe("vetting duration", () => {
  const fa = (journeyId: string, at: Date, normalized: string, to = normalized.toLowerCase()): StageEvent => ({ journeyId, type: "INTEGRATION_STATUS", entityId: "firstadvantage", from: null, to, createdAt: at, data: { normalized } });
  const pev = (journeyId: string, at: Date): StageEvent => ({ journeyId, type: "STAGE_CHANGED", from: "CONDITIONAL_OFFER", to: "PEV", createdAt: at });
  const events: StageEvent[] = [
    pev("a", ago(40)), fa("a", ago(30), "COMPLETE", "cleared"), // 10 days
    pev("b", ago(40)), fa("b", ago(36), "ACTION_NEEDED"), fa("b", ago(32), "IN_PROGRESS"), fa("b", ago(20), "COMPLETE"), // 20 days, 4 waiting on the starter
    pev("c", ago(40)), fa("c", ago(10), "COMPLETE"), // 30 days
    pev("d", ago(8)), fa("d", ago(3), "ACTION_NEEDED"), // in flight
    pev("e", ago(2)), // in flight, no action needed
  ];
  const js = [
    journey("a", [], { currentStage: "UNCONDITIONAL_OFFER" }), journey("b", [], { currentStage: "UNCONDITIONAL_OFFER" }), journey("c", [], { currentStage: "DAY_0" }),
    journey("d", [], { currentStage: "PEV" }), journey("e", [], { currentStage: "PEV" }), journey("f", [], { currentStage: "CONDITIONAL_OFFER" }),
  ];
  const v = buildVetting(events, js, names, meta(["a", "b", "c", "d", "e", "f"]), NOW);

  it("measures request to cleared with median, p90 and average", () => {
    expect(v.cleared).toBe(3);
    expect(v.medianDays).toBe(20);
    expect(v.p90Days).toBe(28);
    expect(v.avgDays).toBe(20);
  });

  it("reports how many cleared vettings needed starter action and for how long", () => {
    expect(v.withActionNeeded).toEqual({ count: 1, pct: 33 });
    expect(v.avgActionNeededDays).toBe(4);
  });

  it("lists in-flight vettings, longest wait first, with open action-needed time", () => {
    expect(v.inFlight.map((r) => [r.journeyId, r.waitingDays, r.actionNeededDays])).toEqual([["d", 8, 3], ["e", 2, null]]);
  });

  it("returns nulls when nothing has cleared", () => {
    const e = buildVetting([], [journey("f", [], { currentStage: "CONDITIONAL_OFFER" })], names, meta(["f"]), NOW);
    expect(e).toMatchObject({ cleared: 0, medianDays: null, p90Days: null, avgDays: null, inFlight: [] });
  });
});

describe("intake outlook and readiness", () => {
  const g = (key: string, status: TaskState["status"], stage: Stage = "CONDITIONAL_OFFER", extra: Partial<TaskState> = {}) => task({ key, status, stage, gating: true, owner: "STARTER", ...extra });

  it("counts only applicable, non-optional gating tasks in the pre-start stages", () => {
    const r = readiness([
      g("a", "DONE"), g("b", "TODO", "PEV"), g("c", "DONE", "UNCONDITIONAL_OFFER"), g("d", "DONE", "DAY_0"),
      g("e", "TODO", "PEV", { applicable: false }), g("f", "TODO", "PEV", { optional: true }), task({ key: "g", gating: false, status: "TODO" }),
    ]);
    expect(r).toEqual({ done: 2, total: 3, pct: 67 });
    expect(readiness([])).toEqual({ done: 0, total: 0, pct: 100 });
  });

  it("starts weeks on Monday UTC", () => {
    expect(weekStartUtc(NOW).toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(weekStartUtc(new Date("2026-11-08T23:00:00Z")).toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it("buckets active upcoming starters into 13 weeks with pooled readiness and a behind flag", () => {
    const soon = journey("a", [g("a1", "DONE"), g("a2", "TODO")], { startDate: ahead(5) }); // this week's Sunday: week 0, 50%, behind (within 14 days, <80%)
    const nextWeek = journey("b", [g("b1", "DONE"), g("b2", "DONE")], { startDate: ahead(10), starterId: "s-b" }); // week 1, 100%
    const nextWeek2 = journey("c", [g("c1", "DONE"), g("c2", "TODO"), g("c3", "TODO"), g("c4", "TODO")], { startDate: ahead(11), starterId: "s-c" }); // week 1, 25%, behind
    const far = journey("d", [g("d1", "TODO")], { startDate: ahead(85), starterId: "s-d" }); // 13th week
    const beyond = journey("e", [g("e1", "TODO")], { startDate: ahead(100) });
    const started = journey("f", [g("f1", "TODO")], { startDate: ago(1) });
    const exited = journey("g", [g("g1", "TODO")], { startDate: ahead(4), status: "exited" });
    const out = buildIntake([soon, nextWeek, nextWeek2, far, beyond, started, exited], names, meta(["a", "b", "c", "d", "e", "f", "g"]), NOW);
    expect(out.weeks).toHaveLength(13);
    expect(out.totalStarters).toBe(4);
    expect(out.weeks[0]).toMatchObject({ weekStart: "2026-11-09", starters: 1, readinessPct: 50, behind: 1 });
    expect(out.weeks[1]).toMatchObject({ weekStart: "2026-11-16", starters: 2, done: 3, total: 6, readinessPct: 50, behind: 1 });
    expect(out.weeks[12].starters).toBe(1);
    expect(out.weeks[2].readinessPct).toBeNull();
    expect(out.starters.map((s) => s.journeyId)).toEqual(["a", "b", "c", "d"]);
    expect(out.starters.find((s) => s.journeyId === "d")!.behind).toBe(false); // too far away to be behind
    expect(out.readinessPct).toBe(Math.round((1 + 2 + 1 + 0) / (2 + 2 + 4 + 1) * 100));
  });
});
