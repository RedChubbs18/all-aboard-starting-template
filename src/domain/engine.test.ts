import { describe, expect, it } from "vitest";
import {
  EngineError,
  addBespokeTask,
  advanceStage,
  applyIntegrationStatus,
  completeTask,
  createJourney,
  exitJourney,
  normalizeIntegrationStatus,
  progress,
  recomputeTasks,
  setTaskStatus,
  type JourneyState,
} from "./index";
import { TEMPLATES } from "./test-fixtures";

const startDate = new Date("2026-12-01T00:00:00Z");
const now = new Date("2026-11-09T09:00:00Z");
let n = 0;
const newId = () => `id-${++n}`;

function make(teamId = "team-a") {
  return createJourney(TEMPLATES, { starterId: "s1", lmId: "lm1", buddyId: "b1", teamId, startDate, now, newId });
}
const status = (j: JourneyState, key: string) => j.tasks.find((t) => t.key === key)!.status;

/** Complete everything gating, in order, until the journey stops moving. */
function finishAll(j: JourneyState): JourneyState {
  let cur = j;
  for (let i = 0; i < 50 && cur.status === "active"; i++) {
    const t = cur.tasks.find((x) => x.gating && x.applicable && x.status !== "DONE" && x.status !== "LOCKED");
    if (!t) break;
    cur = completeTask(cur, t.key, { now }).journey;
  }
  return cur;
}

describe("createJourney", () => {
  it("selects CORE plus the team's TEAM templates only", () => {
    const { journey } = make();
    const keys = journey.tasks.map((t) => t.key);
    expect(keys).toContain("team-checklist");
    expect(keys).not.toContain("other-team");
    expect(journey.tasks).toHaveLength(TEMPLATES.length - 1);
  });

  it("computes due dates from startDate + dueOffsetDays", () => {
    const { journey } = make();
    expect(journey.tasks.find((t) => t.key === "intro")!.dueDate.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(journey.tasks.find((t) => t.key === "goals")!.dueDate.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });

  it("starts at CONDITIONAL_OFFER with only unblocked current-stage tasks TODO", () => {
    const { journey, events } = make();
    expect(journey.currentStage).toBe("CONDITIONAL_OFFER");
    expect(status(journey, "intro")).toBe("TODO");
    expect(status(journey, "contract")).toBe("LOCKED"); // depends on intro
    expect(status(journey, "pev-hireview")).toBe("LOCKED"); // stage not reached
    expect(events[0].type).toBe("JOURNEY_CREATED");
  });

  it("rejects duplicate keys", () => {
    expect(() =>
      createJourney([TEMPLATES[0], TEMPLATES[0]], { starterId: "s", lmId: "l", teamId: "t", startDate }),
    ).toThrow(EngineError);
  });
});

describe("recomputeTasks", () => {
  it("unlocks dependants when the dependency is DONE", () => {
    const { journey } = make();
    const r = completeTask(journey, "intro", { now });
    expect(status(r.journey, "contract")).toBe("TODO");
  });

  it("never downgrades DONE", () => {
    let { journey } = make();
    journey = completeTask(journey, "intro", { now }).journey;
    journey = completeTask(journey, "contract", { now }).journey;
    // Force the dependency back to TODO behind the engine's back.
    const tampered: JourneyState = {
      ...journey,
      tasks: journey.tasks.map((t) => (t.key === "intro" ? { ...t, status: "TODO" } : t)),
    };
    expect(status(recomputeTasks(tampered).journey, "contract")).toBe("DONE");
  });

  it("re-locks a TODO task when its dependency is reopened", () => {
    let { journey } = make();
    journey = completeTask(journey, "intro", { now }).journey;
    journey = setTaskStatus(journey, "intro", "TODO", { now }).journey;
    expect(status(journey, "contract")).toBe("LOCKED");
  });

  it("ignores dependencies on absent keys", () => {
    const tpl = [{ ...TEMPLATES[0], dependsOn: ["missing-key"] }];
    const { journey } = createJourney(tpl, { starterId: "s", lmId: "l", teamId: "t", startDate });
    expect(status(journey, "intro")).toBe("TODO");
  });

  it("respects conditions (FR-4.5): fallback only when induction not booked", () => {
    let { journey } = make();
    expect(journey.tasks.find((t) => t.key === "induction-fallback")!.applicable).toBe(true);
    journey = applyIntegrationStatus(journey, "booking", "booked", { now }).journey;
    expect(status(journey, "book-induction")).toBe("DONE");
    expect(journey.tasks.find((t) => t.key === "induction-fallback")!.applicable).toBe(false);
    expect(progress(journey, now).total).toBe(journey.tasks.length - 1);
  });
});

describe("stage progression", () => {
  it("advances when gating tasks are DONE and emits STAGE_CHANGED", () => {
    const { journey } = make();
    const r = completeTask(journey, "intro", { now });
    expect(r.journey.currentStage).toBe("PEV");
    expect(r.events.some((e) => e.type === "STAGE_CHANGED" && e.from === "CONDITIONAL_OFFER" && e.to === "PEV")).toBe(true);
    expect(status(r.journey, "pev-hireview")).toBe("TODO");
  });

  it("does not advance while a gating task is open", () => {
    const { journey } = make();
    expect(advanceStage(journey).journey.currentStage).toBe("CONDITIONAL_OFFER");
  });

  it("completes the journey when all DAY_30 gating tasks are DONE", () => {
    const j = finishAll(make().journey);
    expect(j.status).toBe("completed");
    expect(j.currentStage).toBe("DAY_30");
    expect(j.completedAt).not.toBeNull();
  });

  it("does nothing on a non-active journey", () => {
    const j = exitJourney(make().journey, "withdrew", { now }).journey;
    expect(advanceStage(j).events).toHaveLength(0);
  });
});

describe("applyIntegrationStatus", () => {
  function atPev() {
    return completeTask(make().journey, "intro", { now }).journey;
  }

  it("HireView cleared marks the task DONE and moves to UNCONDITIONAL_OFFER", () => {
    const r = applyIntegrationStatus(atPev(), "hireview", "cleared", { now });
    expect(status(r.journey, "pev-hireview")).toBe("DONE");
    expect(r.journey.currentStage).toBe("UNCONDITIONAL_OFFER");
    expect(status(r.journey, "internal-account")).toBe("TODO");
  });

  it("HireView cleared forces the stage even if other PEV gating tasks are open", () => {
    const tpl = [
      ...TEMPLATES,
      { ...TEMPLATES[0], key: "pev-extra", stage: "PEV" as const, gating: true, dependsOn: [], title: "Extra" },
    ];
    let j = createJourney(tpl, { starterId: "s", lmId: "l", teamId: "team-a", startDate, now }).journey;
    j = completeTask(j, "intro", { now }).journey;
    j = applyIntegrationStatus(j, "hireview", "cleared", { now }).journey;
    expect(j.currentStage).toBe("UNCONDITIONAL_OFFER");
  });

  it("action_needed blocks the task and flags the journey; cleared unflags", () => {
    let r = applyIntegrationStatus(atPev(), "hireview", "action_needed", { now });
    expect(status(r.journey, "pev-hireview")).toBe("BLOCKED");
    expect(r.journey.flagged).toBe(true);
    expect(r.journey.currentStage).toBe("PEV");
    expect(r.events.some((e) => e.type === "JOURNEY_FLAGGED")).toBe(true);
    expect(progress(r.journey, now).blocked.map((t) => t.key)).toEqual(["pev-hireview"]);
    r = applyIntegrationStatus(r.journey, "hireview", "cleared", { now });
    expect(r.journey.flagged).toBe(false);
    expect(r.events.some((e) => e.type === "JOURNEY_UNFLAGGED")).toBe(true);
  });

  it("failed flags for P&P, reassigns the task, and does not exit", () => {
    const r = applyIntegrationStatus(atPev(), "hireview", "failed", { now });
    const t = r.journey.tasks.find((x) => x.key === "pev-hireview")!;
    expect(t.status).toBe("BLOCKED");
    expect(t.owner).toBe("PNP");
    expect(r.journey.status).toBe("active");
    expect(r.journey.flagged).toBe(true);
    expect(r.events.some((e) => e.type === "INTEGRATION_FAILED")).toBe(true);
  });

  it("in_progress moves a TODO task to IN_PROGRESS", () => {
    const r = applyIntegrationStatus(atPev(), "hireview", "in_progress", { now });
    expect(status(r.journey, "pev-hireview")).toBe("IN_PROGRESS");
  });

  it("system completion unlocks dependants (Colleague File ID -> IT requests)", () => {
    let j = applyIntegrationStatus(atPev(), "hireview", "cleared", { now }).journey;
    expect(status(j, "it-request")).toBe("LOCKED");
    j = applyIntegrationStatus(j, "identity", "created", { now }).journey;
    expect(status(j, "it-request")).toBe("TODO");
  });

  it("normalises statuses", () => {
    expect(normalizeIntegrationStatus("Cleared")).toBe("COMPLETE");
    expect(normalizeIntegrationStatus("action_needed")).toBe("ACTION_NEEDED");
    expect(normalizeIntegrationStatus("weird")).toBe("NOT_STARTED");
  });
});

describe("setTaskStatus / bespoke / exit", () => {
  it("refuses to change LOCKED tasks and requires a blocked reason", () => {
    const { journey } = make();
    expect(() => setTaskStatus(journey, "contract", "DONE")).toThrow(EngineError);
    expect(() => setTaskStatus(journey, "intro", "BLOCKED")).toThrow(/blockedReason/);
  });

  it("emits an audit event for every change", () => {
    const r = completeTask(make().journey, "intro", { now, actorId: "s1" });
    const e = r.events.find((x) => x.type === "TASK_STATUS_CHANGED" && x.to === "DONE")!;
    expect(e).toMatchObject({ actorId: "s1", entity: "Task", from: "TODO", journeyId: r.journey.id });
  });

  it("adds a bespoke task that is immediately visible and unlocked", () => {
    const r = addBespokeTask(make().journey, {
      title: "Meet the CTO",
      stage: "CONDITIONAL_OFFER",
      dueDate: new Date("2026-11-20T00:00:00Z"),
    });
    const t = r.journey.tasks.find((x) => x.title === "Meet the CTO")!;
    expect(t.source).toBe("BESPOKE");
    expect(t.status).toBe("TODO");
    expect(r.events[0].type).toBe("TASK_ADDED");
  });

  it("exits with a reason and records the stage reached", () => {
    const j = completeTask(make().journey, "intro", { now }).journey;
    const r = exitJourney(j, "Accepted another offer", { now });
    expect(r.journey).toMatchObject({ status: "exited", exitReason: "Accepted another offer", exitStage: "PEV" });
    expect(r.events[0]).toMatchObject({ type: "JOURNEY_EXITED" });
    expect(() => exitJourney(j, " ")).toThrow(EngineError);
    expect(() => completeTask(r.journey, "pev-hireview")).toThrow(/exited/);
  });
});

describe("progress", () => {
  it("reports percent, remaining, next due, overdue and blocked", () => {
    let { journey } = make();
    journey = completeTask(journey, "intro", { now }).journey;
    const p = progress(journey, new Date("2026-11-30T00:00:00Z"));
    expect(p.total).toBe(journey.tasks.length);
    expect(p.done).toBe(1);
    expect(p.remaining).toBe(p.total - 1);
    expect(p.percent).toBe(Math.round((1 / p.total) * 100));
    expect(p.nextDue[0].key).toBe("contract"); // earliest open due date
    expect(p.nextDue.length).toBeLessThanOrEqual(5);
    expect(p.overdue.map((t) => t.key)).toEqual(expect.arrayContaining(["contract", "pev-hireview"]));
    expect(p.perStage.CONDITIONAL_OFFER).toEqual({ total: 2, done: 1 });
    expect(p.stage).toBe("PEV");
  });
});

describe("named conditions and overrides (seed content)", () => {
  const tpl = (over: Partial<(typeof TEMPLATES)[number]> & { key: string }) => ({
    ...TEMPLATES[0], gating: false, dependsOn: [], condition: null, stage: "UNCONDITIONAL_OFFER" as const, ...over,
  });
  const set = [
    TEMPLATES[0],
    tpl({ key: "photo-check-passed", adapterKey: "photocheck", gating: true }),
    tpl({ key: "photo-check-override", owner: "PNP", condition: "photo-check-failed" }),
    tpl({ key: "order-pass", dependsOn: ["photo-check-passed"] }),
  ];
  const start = () => {
    let j = createJourney(set, { starterId: "s", lmId: "l", teamId: "t", startDate, now, newId }).journey;
    j = completeTask(j, "intro", { now }).journey; // PEV has no gating tasks -> straight through
    return j;
  };

  it("hides the override until the photo check fails, then a DONE override satisfies it", () => {
    let j = start();
    expect(j.currentStage).toBe("UNCONDITIONAL_OFFER");
    expect(j.tasks.find((t) => t.key === "photo-check-override")!.applicable).toBe(false);
    expect(status(j, "order-pass")).toBe("LOCKED");
    j = applyIntegrationStatus(j, "photocheck", "failed", { now }).journey;
    expect(j.tasks.find((t) => t.key === "photo-check-override")!.applicable).toBe(true);
    expect(j.flagged).toBe(true);
    j = completeTask(j, "photo-check-override", { now, actorId: "pnp" }).journey;
    expect(status(j, "order-pass")).toBe("TODO");
    expect(j.flagged).toBe(false);
    expect(j.currentStage).not.toBe("UNCONDITIONAL_OFFER"); // gating photo task satisfied by the override
  });

  it("induction-not-booked and pev-steps-incomplete evaluate against their tasks", () => {
    const base = TEMPLATES[0];
    const set2 = [
      { ...base, key: "book-induction", gating: false, stage: "CONDITIONAL_OFFER" as const },
      { ...base, key: "fallback", gating: false, condition: "induction-not-booked" },
      { ...base, key: "complete-vetting-steps", gating: false },
      { ...base, key: "reminder", gating: false, condition: "pev-steps-incomplete" },
    ];
    let j = createJourney(set2, { starterId: "s", lmId: "l", teamId: "t", startDate, newId }).journey;
    expect(j.tasks.filter((t) => !t.applicable)).toHaveLength(0);
    j = completeTask(j, "book-induction").journey;
    j = completeTask(j, "complete-vetting-steps").journey;
    expect(j.tasks.filter((t) => !t.applicable).map((t) => t.key).sort()).toEqual(["fallback", "reminder"]);
  });
});
