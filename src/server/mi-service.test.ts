import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./db";
import {
  CHASE_EVENT_TYPE,
  MiError,
  buildChaseRows,
  buildExitReport,
  buildIssues,
  chaseLm,
  chaseSuppressed,
  classifyTask,
  computeFunnel,
  computeKpis,
  parseFilters,
  raiseSupport,
  resolveReasonSource,
  routeSupport,
  type StageEvent,
} from "./mi-service";
import type { JourneyState, TaskState } from "@/domain/types";
import { getAdapter } from "@/adapters/registry";

const NOW = new Date("2026-11-10T12:00:00Z");
const D = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * D);

const task = (o: Partial<TaskState> & { key: string }): TaskState => ({
  id: o.key, templateId: null, title: o.key, description: "", stage: "PEV", owner: "STARTER", type: "ACTION", status: "TODO",
  dueDate: ago(-5), completedAt: null, blockedReason: null, evidence: null, dependsOn: [], source: "CORE", adapterKey: null,
  gating: false, contentSlug: null, condition: null, applicable: true, sortOrder: 0, ...o,
});
const journey = (id: string, tasks: TaskState[], o: Partial<JourneyState> = {}): JourneyState => ({
  id, starterId: `s-${id}`, lmId: "lm1", buddyId: null, teamId: "t", startDate: ago(3), currentStage: "PEV", status: "active",
  exitReason: null, exitStage: null, completedAt: null, flagged: false, flagReason: null, tasks, ...o,
});
const names = new Map([["lm1", "Sam Patel"], ["lm2", "Pat Quinn"], ["s-a", "Alex"], ["s-b", "Bea"]]);

describe("funnel and time in stage", () => {
  const ev = (journeyId: string, type: string, at: Date, from: string | null = null, to: string | null = null): StageEvent => ({ journeyId, type, from, to, createdAt: at });
  const events: StageEvent[] = [
    // a: reached PEV and UNCONDITIONAL, still there. PEV stay 4d, CONDITIONAL stay 2d.
    ev("a", "JOURNEY_CREATED", ago(10)),
    ev("a", "STAGE_CHANGED", ago(8), "CONDITIONAL_OFFER", "PEV"),
    ev("a", "STAGE_CHANGED", ago(4), "PEV", "UNCONDITIONAL_OFFER"),
    // b: exited in PEV after 6d there; CONDITIONAL stay 1d.
    ev("b", "JOURNEY_CREATED", ago(10)),
    ev("b", "STAGE_CHANGED", ago(9), "CONDITIONAL_OFFER", "PEV"),
    ev("b", "JOURNEY_EXITED", ago(3), "active", "exited"),
    // c: only created, open stay.
    ev("c", "JOURNEY_CREATED", ago(1)),
    // d: not in the filtered set.
    ev("d", "JOURNEY_CREATED", ago(5)),
  ];
  const rows = computeFunnel(events, ["a", "b", "c"]);
  const by = (s: string) => rows.find((r) => r.stage === s)!;

  it("counts journeys reaching each stage in stage order", () => {
    expect(rows.map((r) => r.stage)).toEqual(["CONDITIONAL_OFFER", "PEV", "UNCONDITIONAL_OFFER", "DAY_0", "DAY_30"]);
    expect(rows.map((r) => r.reached)).toEqual([3, 2, 1, 0, 0]);
    expect(by("PEV").pct).toBe(67);
    expect(by("DAY_0").pct).toBe(0);
  });
  it("computes median and average over completed stays only", () => {
    expect(by("CONDITIONAL_OFFER").stays).toBe(2); // c is still open
    expect(by("CONDITIONAL_OFFER").medianDays).toBe(1.5);
    expect(by("PEV").medianDays).toBe(5); // 4 and 6
    expect(by("PEV").avgDays).toBe(5);
    expect(by("UNCONDITIONAL_OFFER").medianDays).toBeNull(); // open stay
    expect(by("DAY_30").avgDays).toBeNull();
  });
  it("ignores events for other journeys and unrelated types", () => {
    const noisy = computeFunnel([...events, ev("a", "TASK_STATUS_CHANGED", ago(1))], ["a"]);
    expect(noisy.map((r) => r.reached)).toEqual([1, 1, 1, 0, 0]);
  });
  it("handles an empty log", () => {
    expect(computeFunnel([], []).every((r) => r.reached === 0 && r.pct === 0 && r.medianDays === null)).toBe(true);
  });
});

describe("issue classification and routing", () => {
  it("classifies blocked, overdue, and failed integration steps; skips done, locked and not applicable", () => {
    expect(classifyTask(task({ key: "x", status: "BLOCKED" }), undefined, NOW)).toBe("BLOCKED");
    expect(classifyTask(task({ key: "x", dueDate: ago(2) }), undefined, NOW)).toBe("OVERDUE");
    expect(classifyTask(task({ key: "x", adapterKey: "hireview", status: "BLOCKED" }), "action_needed", NOW)).toBe("ACTION_NEEDED");
    expect(classifyTask(task({ key: "x", adapterKey: "hireview", status: "BLOCKED" }), "failed", NOW)).toBe("FAILED");
    expect(classifyTask(task({ key: "x", status: "DONE", dueDate: ago(2) }), undefined, NOW)).toBeNull();
    expect(classifyTask(task({ key: "x", status: "LOCKED", dueDate: ago(2) }), undefined, NOW)).toBeNull();
    expect(classifyTask(task({ key: "x", applicable: false, dueDate: ago(2) }), undefined, NOW)).toBeNull();
    expect(classifyTask(task({ key: "x", dueDate: ago(-1) }), undefined, NOW)).toBeNull();
  });

  it("routes by task owner", () => {
    const lm = { id: "lm1", name: "Sam Patel" };
    expect(routeSupport({ owner: "LM", adapterKey: null }, lm)).toMatchObject({ toUserId: "lm1", kind: "USER" });
    expect(routeSupport({ owner: "PNP", adapterKey: null }, lm)).toMatchObject({ toUserId: "queue:pnp", label: "P&P queue" });
    expect(routeSupport({ owner: "SYSTEM", adapterKey: "hireview" }, lm)).toMatchObject({ label: "First Advantage", kind: "QUEUE" });
    expect(routeSupport({ owner: "SYSTEM", adapterKey: "itrequest" }, lm).label).toBe("IT Service Desk");
    expect(routeSupport({ owner: "SYSTEM", adapterKey: null }, lm).label).toBe("Integrations support");
    expect(routeSupport({ owner: "STARTER", adapterKey: null }, lm).toUserId).toBe("lm1");
  });

  it("builds sorted issues with days overdue, active journeys only", () => {
    const j = journey("a", [
      task({ key: "late", dueDate: ago(7), owner: "LM" }),
      task({ key: "hv", adapterKey: "hireview", status: "BLOCKED", owner: "SYSTEM", dueDate: ago(-2) }),
      task({ key: "fine" }),
    ]);
    const gone = journey("b", [task({ key: "old", dueDate: ago(9) })], { status: "exited" });
    const issues = buildIssues([j, gone], names, new Map([["a|hireview", "failed"]]), NOW);
    expect(issues.map((i) => [i.taskKey, i.kind, i.daysOverdue])).toEqual([["hv", "FAILED", 0], ["late", "OVERDUE", 7]]);
    expect(issues[0].routeLabel).toBe("First Advantage");
    expect(issues[1].routeLabel).toBe("Line manager: Sam Patel");
  });
});

describe("chase eligibility (D3)", () => {
  it("lists an LM only when an LM-owned, actionable, past-due task exists", () => {
    const rows = buildChaseRows(
      [
        journey("a", [task({ key: "lm-late", owner: "LM", dueDate: ago(3) }), task({ key: "starter-late", owner: "STARTER", dueDate: ago(9) })]),
        journey("b", [task({ key: "lm-done", owner: "LM", status: "DONE", dueDate: ago(3) }), task({ key: "lm-future", owner: "LM", dueDate: ago(-3) })], { lmId: "lm2", starterId: "s-b" }),
      ],
      names,
      new Map(),
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lmId: "lm1", canChase: true, lastChasedAt: null });
    expect(rows[0].overdue.map((t) => t.taskKey)).toEqual(["lm-late"]);
  });

  it("suppresses a second chase within 24h and allows it after", () => {
    expect(chaseSuppressed(null, NOW)).toBe(false);
    expect(chaseSuppressed(new Date(NOW.getTime() - 23 * 3_600_000), NOW)).toBe(true);
    expect(chaseSuppressed(new Date(NOW.getTime() - 24 * 3_600_000), NOW)).toBe(false);
    const j = [journey("a", [task({ key: "lm-late", owner: "LM", dueDate: ago(3) })])];
    const recent = new Date(NOW.getTime() - 2 * 3_600_000);
    const [row] = buildChaseRows(j, names, new Map([["lm1", recent]]), NOW);
    expect(row.canChase).toBe(false);
    expect(row.lastChasedAt).toBe(recent.toISOString());
    expect(row.blockedUntil).toBe(new Date(recent.getTime() + D).toISOString());
    expect(buildChaseRows(j, names, new Map([["lm1", ago(2)]]), NOW)[0].canChase).toBe(true);
  });
});

describe("kpis, exits and filters", () => {
  it("computes KPI tiles", () => {
    const k = computeKpis(
      [
        { status: "active", flagged: true, startDate: ago(-3) },
        { status: "active", flagged: false, startDate: ago(-100) },
        { status: "active", flagged: false, startDate: ago(5) },
        { status: "exited", flagged: true, startDate: ago(30) },
        { status: "completed", flagged: false, startDate: ago(60) },
      ],
      NOW,
    );
    expect(k).toEqual({ active: 3, startingSoon: 1, flagged: 1, exited: 1, completed: 1 });
  });

  it("counts exits by reason and by stage in stage order", () => {
    const r = buildExitReport([
      { journeyId: "1", starterName: "A", workEmail: "", stage: "DAY_0", reason: "WITHDRAWN", reasonSource: null, comment: null, exitedAt: "2026-11-01T00:00:00Z" },
      { journeyId: "2", starterName: "B", workEmail: "", stage: "PEV", reason: "WITHDRAWN", reasonSource: "COLLEAGUE", comment: null, exitedAt: "2026-11-05T00:00:00Z" },
      { journeyId: "3", starterName: "C", workEmail: "", stage: "PEV", reason: null, reasonSource: null, comment: null, exitedAt: null },
    ]);
    expect(r.byReason).toEqual([{ key: "WITHDRAWN", count: 2 }, { key: "Not recorded", count: 1 }]);
    expect(r.byStage).toEqual([{ key: "PEV", count: 2 }, { key: "DAY_0", count: 1 }]);
    expect(r.rows[0].journeyId).toBe("2");
    expect(r.colleagueSupplied).toEqual({ count: 1, total: 3, pct: 33 });
    expect(resolveReasonSource("NO_SHOW", undefined)).toBe("PNP");
    expect(resolveReasonSource("OTHER", undefined)).toBe("COLLEAGUE");
    expect(resolveReasonSource("LEGACY", undefined)).toBeNull();
    expect(resolveReasonSource("LEGACY", "PNP")).toBe("PNP");
  });

  it("parses filters and drops invalid values", () => {
    expect(parseFilters(new URLSearchParams("stage=PEV&status=flagged&from=2026-01-01&to=nope&area=Ops&team="))).toEqual({
      stage: "PEV", status: "flagged", from: "2026-01-01", area: "Ops",
    });
    expect(parseFilters(new URLSearchParams("stage=HACK&status=x&from=2026-13-45"))).toEqual({});
  });
});

describe("chaseLm and raiseSupport (database)", () => {
  const P = "mi-";
  beforeAll(async () => {
    await prisma.team.create({ data: { id: `${P}team`, name: "MI Team", area: "MI Area" } });
    for (const [id, roles] of [["lm", ["LM"]], ["starter", ["STARTER"]], ["pnp", ["PNP"]]] as const) {
      await prisma.user.create({ data: { id: `${P}${id}`, upn: `${P}${id}@example.test`, displayName: id, roles: [...roles], teamId: `${P}team` } });
    }
    await prisma.journey.create({
      data: {
        id: `${P}j`, starterId: `${P}starter`, lmId: `${P}lm`, teamId: `${P}team`, startDate: new Date(Date.now() - 10 * D), currentStage: "PEV",
        tasks: {
          create: [
            { id: `${P}t1`, key: "lm-task", title: "Book induction", stage: "PEV", owner: "LM", type: "ACTION", status: "TODO", dueDate: new Date(Date.now() - 3 * D), dependsOn: [] },
            { id: `${P}t2`, key: "sys-task", title: "Vetting check", stage: "PEV", owner: "SYSTEM", type: "INTEGRATION_STATUS", status: "BLOCKED", dueDate: new Date(Date.now() + D), dependsOn: [], adapterKey: "hireview" },
          ],
        },
      },
    });
  });

  it("chases once, records an audit event, notifies the LM, and refuses a second chase within 24h", async () => {
    const res = await chaseLm(`${P}lm`, `${P}pnp`);
    expect(res.taskCount).toBe(1);
    const events = await prisma.event.findMany({ where: { type: CHASE_EVENT_TYPE, entityId: `${P}lm` } });
    expect(events).toHaveLength(1);
    expect(events[0].actorId).toBe(`${P}pnp`);
    const notifier = await getAdapter("notification");
    const sent = await notifier.list({ toUserId: `${P}lm` });
    expect(sent.at(-1)).toMatchObject({ kind: "CHASE_LM" });
    expect(sent.at(-1)!.body).toContain("Book induction");

    const err = await chaseLm(`${P}lm`, `${P}pnp`).catch((e) => e);
    expect(err).toBeInstanceOf(MiError);
    expect(err).toMatchObject({ status: 409, code: "recently_chased" });
    expect(await prisma.event.count({ where: { type: CHASE_EVENT_TYPE, entityId: `${P}lm` } })).toBe(1);
  });

  it("allows another chase after 24h", async () => {
    const later = new Date(Date.now() + 25 * 3_600_000);
    await expect(chaseLm(`${P}lm`, `${P}pnp`, later)).resolves.toMatchObject({ taskCount: 1 });
  });

  it("rejects a chase when nothing is overdue", async () => {
    await expect(chaseLm("mi-nobody", `${P}pnp`)).rejects.toMatchObject({ code: "nothing_overdue" });
  });

  it("raises support routed by task owner and records an event", async () => {
    const r = await raiseSupport({ journeyId: `${P}j`, taskKey: "sys-task", note: "Please look" }, `${P}pnp`);
    expect(r.routedTo).toBe("First Advantage");
    const ev = await prisma.event.findFirst({ where: { type: "SUPPORT_RAISED", journeyId: `${P}j` } });
    expect(ev).toMatchObject({ actorId: `${P}pnp`, entity: "Task", entityId: "sys-task" });
    const lmRoute = await raiseSupport({ journeyId: `${P}j`, taskKey: "lm-task" }, `${P}pnp`);
    expect(lmRoute.routedTo).toContain("Line manager");
    await expect(raiseSupport({ journeyId: "missing" }, `${P}pnp`)).rejects.toMatchObject({ status: 404 });
  });
});
