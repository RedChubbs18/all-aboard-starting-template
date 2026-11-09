/**
 * Regression tests against the REAL content/seed/templates.json (the synthetic fixtures in test-fixtures.ts
 * hid these bugs): LOCKED over-completion by integration statuses, photo recertification, overdue consistency.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyIntegrationStatus,
  completeTask,
  createJourney,
  isEffectivelyDone,
  isOverdue,
  normalizeIntegrationStatus,
  progress,
  requestPhotoReview,
  type JourneyState,
} from "./index";
import { templatesFileSchema, toTemplateInput } from "./seed-schema";

const templates = templatesFileSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "content/seed/templates.json"), "utf8"))).map(toTemplateInput);
const now = new Date("2026-11-09T09:00:00Z");
const startDate = new Date("2027-01-11T00:00:00Z");
let n = 0;
const newId = () => `rt-${++n}`;
const make = () => createJourney(templates, { starterId: "s", lmId: "lm", teamId: "no-such-team", startDate, now, newId }).journey;
const task = (j: JourneyState, key: string) => j.tasks.find((t) => t.key === key)!;
const done = (j: JourneyState, ...keys: string[]) => keys.reduce((cur, k) => completeTask(cur, k, { now }).journey, j);

/** Drive the real journey to UNCONDITIONAL_OFFER by completing every earlier-stage task. */
function toUnconditional(): JourneyState {
  let j = make();
  for (let i = 0; i < 80 && j.currentStage !== "UNCONDITIONAL_OFFER"; i++) {
    const t = j.tasks.find((x) => x.applicable && x.stage !== "UNCONDITIONAL_OFFER" && x.stage !== "DAY_0" && x.stage !== "DAY_30" && (x.status === "TODO" || x.status === "IN_PROGRESS" || x.status === "BLOCKED"));
    if (!t) break;
    j = completeTask(j, t.key, { now }).journey;
  }
  expect(j.currentStage).toBe("UNCONDITIONAL_OFFER");
  return j;
}

describe("real templates: integration statuses never touch LOCKED tasks", () => {
  it("equipment `ordered` during CONDITIONAL_OFFER does not complete Day 0 tasks", () => {
    const j = make();
    expect(j.currentStage).toBe("CONDITIONAL_OFFER");
    const r = applyIntegrationStatus(j, "equipment", "ordered", { now }).journey;
    for (const t of r.tasks.filter((x) => x.stage === "DAY_0")) expect(t.status, t.key).toBe("LOCKED");
    expect(r.tasks.filter((x) => x.adapterKey === "equipment" && x.status === "DONE")).toEqual([]);
  });

  it("failed/action_needed do not block LOCKED tasks either, and keep the journey unflagged", () => {
    const j = make();
    for (const status of ["failed", "action_needed"]) {
      const r = applyIntegrationStatus(j, "firstadvantage", status, { now }).journey;
      expect(task(r, "firstadvantage-vetting-status").status).toBe("LOCKED");
      expect(r.flagged).toBe(false);
    }
  });

  it("recognises every completion word the mocks emit", () => {
    for (const w of ["collected", "delivered", "printed", "fulfilled", "ordered", "booked", "ready", "cleared"]) {
      expect(normalizeIntegrationStatus(w), w).toBe("COMPLETE");
    }
  });
});

describe("real templates: photo recertification (D12)", () => {
  it("the override task has no dependency, so it is actionable as soon as the check fails", () => {
    expect(templates.find((t) => t.key === "photo-check-override")!.dependsOn).toEqual([]);
    let j = toUnconditional();
    expect(task(j, "photo-check-override").applicable).toBe(false);
    j = requestPhotoReview(j, { now, detail: "Sunglasses" }).journey;
    expect(task(j, "photo-check-passed").status).toBe("BLOCKED");
    expect(task(j, "photo-check-override").applicable).toBe(true);
    expect(task(j, "photo-check-override").status).toBe("TODO");
    expect(j.flagged).toBe(true);
  });

  it("after the override the journey is no longer blocked, progress counts it as done and the pass order unlocks", () => {
    let j = toUnconditional();
    j = done(j, "propose-day-0-arrangements", "confirm-day-0-arrangements");
    expect(task(j, "order-photo-id-pass").status).toBe("LOCKED");
    j = requestPhotoReview(j, { now }).journey;
    expect(progress(j, now).blocked.map((t) => t.key)).toContain("photo-check-passed");
    j = completeTask(j, "photo-check-override", { now }).journey;
    const p = progress(j, now);
    expect(p.blocked).toEqual([]);
    expect(j.flagged).toBe(false);
    expect(isEffectivelyDone(task(j, "photo-check-passed"), j.tasks)).toBe(true);
    expect(p.nextDue.map((t) => t.key)).not.toContain("photo-check-passed");
    expect(task(j, "order-photo-id-pass").status).toBe("TODO");
    const total = j.tasks.filter((t) => t.applicable && !t.optional);
    expect(p.done).toBe(total.filter((t) => isEffectivelyDone(t, j.tasks)).length);
  });
});

describe("real templates: overdue (D3 clarification)", () => {
  it("is never LOCKED, done, optional or inapplicable, and the engine progress uses the same helper", () => {
    const j = make();
    const later = new Date("2027-03-01T00:00:00Z"); // after every due date
    const p = progress(j, later);
    const expected = j.tasks.filter((t) => isOverdue(t, later, j.tasks)).map((t) => t.key).sort();
    expect(p.overdue.map((t) => t.key).sort()).toEqual(expected);
    expect(p.overdue.length).toBeGreaterThan(0);
    for (const t of p.overdue) {
      expect(t.status).not.toBe("LOCKED");
      expect(t.status).not.toBe("DONE");
    }
    expect(j.tasks.some((t) => t.status === "LOCKED")).toBe(true); // locked tasks exist but are excluded
  });

  it("treats a task satisfied by a DONE override as not overdue", () => {
    let j = toUnconditional();
    j = requestPhotoReview(j, { now }).journey;
    const later = new Date("2027-03-01T00:00:00Z");
    expect(isOverdue(task(j, "photo-check-passed"), later, j.tasks)).toBe(true);
    j = completeTask(j, "photo-check-override", { now }).journey;
    expect(isOverdue(task(j, "photo-check-passed"), later, j.tasks)).toBe(false);
    expect(progress(j, later).overdue.map((t) => t.key)).not.toContain("photo-check-passed");
  });
});
