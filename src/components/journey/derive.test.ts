import { describe, expect, it } from "vitest";
import { applyOptimisticDone, computeProgress, deriveView, describeChange, displayPercent } from "./derive";
import { task } from "./test-data";
import { pointAt, milestonePoint } from "./track-geometry";

const now = new Date("2026-11-20T10:00:00Z");

describe("computeProgress", () => {
  const st = (state: "done" | "current" | "locked", gd: number, gt: number) => ({ state, gatingDone: gd, gatingTotal: gt, doneCount: gd, totalCount: gt });
  it("is 0 with no tasks in current/future stages and 1 for empty past stages", () => {
    expect(computeProgress([st("current", 0, 0), st("locked", 0, 0)], false)).toBe(0);
    expect(computeProgress([st("done", 0, 0), st("current", 0, 0)], false)).toBe(0.5);
  });
  it("averages stage fractions (past 1, mid-stage partial, future 0)", () => {
    expect(computeProgress([st("done", 3, 3), st("current", 1, 2), st("locked", 0, 4), st("locked", 0, 1), st("locked", 0, 1)], false)).toBeCloseTo(0.3);
  });
  it("caps the displayed percent at 99 until completed", () => {
    expect(displayPercent(0.999, false)).toBe(99);
    expect(displayPercent(1, true)).toBe(100);
    expect(computeProgress([st("done", 1, 1)], true)).toBe(1);
  });
});

describe("deriveView", () => {
  const tasks = [
    task({ key: "a", stage: "CONDITIONAL_OFFER", status: "DONE" }),
    task({ key: "b", stage: "CONDITIONAL_OFFER", status: "TODO", dueDate: "2026-11-25T00:00:00.000Z" }),
    task({ key: "c", stage: "PEV", status: "LOCKED", dependsOn: ["b"] }),
    task({ key: "hidden", stage: "PEV", status: "TODO", applicable: false }),
  ];
  it("hides non-applicable tasks and counts the rest", () => {
    const v = deriveView({ tasks, currentStage: "CONDITIONAL_OFFER", status: "active" }, now);
    expect(v.taskTotal).toBe(3);
    expect(v.remainingCount).toBe(2);
    expect(v.nextTasks.map((t) => t.title)).toEqual(["b"]);
    expect(v.stages[0].state).toBe("current");
    expect(v.stages[1].unlockHint).toMatch(/Unlocks when Conditional offer/);
    expect(v.projectedFinish).toBe("2026-12-01T00:00:00.000Z");
  });
  it("puts overdue tasks first", () => {
    const v = deriveView({ tasks: [task({ key: "late", stage: "PEV", dueDate: "2026-11-01T00:00:00.000Z" }), task({ key: "soon", stage: "PEV", dueDate: "2026-11-21T00:00:00.000Z" })], currentStage: "PEV", status: "active" }, now);
    expect(v.nextTasks[0].title).toBe("late");
    expect(v.nextTasks[0].overdue).toBe(true);
  });
});

describe("progress update without reload (optimistic)", () => {
  it("completing a task raises progress, lowers remaining count, updates next-due and unlocks dependants", () => {
    const tasks = [
      task({ key: "a", stage: "CONDITIONAL_OFFER", status: "TODO", dueDate: "2026-11-25T00:00:00.000Z" }),
      task({ key: "b", stage: "CONDITIONAL_OFFER", status: "LOCKED", dependsOn: ["a"], dueDate: "2026-11-28T00:00:00.000Z" }),
    ];
    const input = { currentStage: "CONDITIONAL_OFFER" as const, status: "active" as const };
    const before = deriveView({ ...input, tasks }, now);
    const after = deriveView({ ...input, tasks: applyOptimisticDone(tasks, tasks[0].id, "CONDITIONAL_OFFER", now) }, now);
    expect(after.progress).toBeGreaterThan(before.progress);
    expect(after.remainingCount).toBe(before.remainingCount - 1);
    expect(after.nextTasks.map((t) => t.title)).toEqual(["b"]);
    const msg = describeChange(before, after, "a");
    expect(msg).toContain("a marked done.");
    expect(msg).toMatch(/Journey \d+ percent complete\. 1 task to go\. Next: b, due/);
  });
  it("does not mutate the input and ignores already-done tasks", () => {
    const tasks = [task({ key: "a", stage: "PEV", status: "DONE" })];
    expect(applyOptimisticDone(tasks, tasks[0].id, "PEV")).toBe(tasks);
  });
  it("announces a re-opened task and an all-done journey", () => {
    const base = { stages: [], progress: 0.6, percent: 60, remainingCount: 4, nextTasks: [], completed: false, currentStageNumber: 3 };
    expect(describeChange(base, { ...base, progress: 0.55, percent: 55, remainingCount: 5 })).toBe("Journey now 55 percent complete. 5 tasks to go.");
    expect(describeChange(base, { ...base, progress: 1, percent: 100, remainingCount: 0, completed: true })).toBe("All onboarding tasks complete. Journey 100 percent complete.");
    expect(describeChange(base, base)).toBeNull();
  });
});

describe("track geometry", () => {
  it("starts at the start line and ends at the finish flag", () => {
    expect(pointAt(0).x).toBe(28);
    expect(pointAt(1).x).toBe(328);
    expect(milestonePoint(5)).toEqual(pointAt(1));
    expect(Math.abs(pointAt(0.3).angle)).toBeLessThanOrEqual(12);
  });
  it("clamps out-of-range progress", () => {
    expect(pointAt(-1).x).toBe(28);
    expect(pointAt(2).x).toBe(328);
  });
});
