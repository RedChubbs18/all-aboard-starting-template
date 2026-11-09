/** Feedback round 1: optional tasks (F12), auto-complete flag (F4), vetting failure (F7), buddy dependency (F3). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyIntegrationStatus, completeTask, createJourney, isVettingFailed, progress, type JourneyState, type TemplateInput } from "./index";
import { templatesFileSchema } from "./seed-schema";

const base = { description: "", source: "CORE" as const, dependsOn: [] as string[], gating: false, dueOffsetDays: 0 };
const now = new Date("2026-11-09T09:00:00Z");
let n = 0;
const newId = () => `f1-${++n}`;
const TPL: TemplateInput[] = [
  { ...base, key: "device", title: "Device", stage: "CONDITIONAL_OFFER", owner: "STARTER", type: "ORDER", gating: true },
  { ...base, key: "periph", title: "Peripherals", stage: "CONDITIONAL_OFFER", owner: "STARTER", type: "ORDER", dependsOn: ["device"], optional: true, gating: true },
  { ...base, key: "after", title: "After peripherals", stage: "CONDITIONAL_OFFER", owner: "STARTER", type: "INFO", dependsOn: ["periph"], autoCompleteOnOpen: true },
  { ...base, key: "fa", title: "FA status", stage: "PEV", owner: "SYSTEM", type: "INTEGRATION_STATUS", adapterKey: "firstadvantage", gating: true },
  { ...base, key: "fa-steps", title: "Enter vetting info", stage: "PEV", owner: "STARTER", type: "ACTION", adapterKey: "firstadvantage" },
  { ...base, key: "other", title: "Other starter task", stage: "PEV", owner: "STARTER", type: "INFO" },
];
const make = (): JourneyState =>
  createJourney(TPL, { starterId: "s", lmId: "l", teamId: "t", startDate: new Date("2026-12-01T00:00:00Z"), now, newId }).journey;
const st = (j: JourneyState, k: string) => j.tasks.find((t) => t.key === k)!.status;

describe("F12 optional tasks", () => {
  it("are never gating, even if the template says so", () => {
    expect(make().tasks.find((t) => t.key === "periph")).toMatchObject({ optional: true, gating: false });
  });
  it("do not hold back the stage or the tasks that follow them", () => {
    let j = make();
    expect(st(j, "after")).toBe("TODO"); // not waiting for the optional task
    j = completeTask(j, "device", { now }).journey;
    j = completeTask(j, "after", { now }).journey;
    expect(j.currentStage).toBe("PEV");
    expect(st(j, "periph")).not.toBe("DONE");
  });
  it("are excluded from progress", () => {
    const j = make();
    expect(progress(j, now).total).toBe(j.tasks.filter((t) => !t.optional).length);
  });
});

describe("F4 autoCompleteOnOpen", () => {
  it("is copied onto the task snapshot", () => {
    const j = make();
    expect(j.tasks.find((t) => t.key === "after")!.autoCompleteOnOpen).toBe(true);
    expect(j.tasks.find((t) => t.key === "device")!.autoCompleteOnOpen).toBe(false);
  });
});

describe("F7 vetting failed", () => {
  it("is detected only after First Advantage fails, not for action_needed", () => {
    let j = make();
    j = completeTask(j, "device", { now }).journey;
    j = completeTask(j, "after", { now }).journey;
    expect(isVettingFailed(j)).toBe(false);
    expect(isVettingFailed(applyIntegrationStatus(j, "firstadvantage", "action_needed", { now }).journey)).toBe(false);
    const failed = applyIntegrationStatus(j, "firstadvantage", "failed", { now }).journey;
    expect(isVettingFailed(failed)).toBe(true);
    expect(failed.flagged).toBe(true);
  });
  it("clears when P&P resolve it", () => {
    let j = make();
    j = completeTask(j, "device", { now }).journey;
    j = completeTask(j, "after", { now }).journey;
    j = applyIntegrationStatus(j, "firstadvantage", "failed", { now }).journey;
    j = applyIntegrationStatus(j, "firstadvantage", "cleared", { now }).journey;
    expect(isVettingFailed(j)).toBe(false);
  });
});

describe("seed templates (F3, F4, F5, F10, F12)", () => {
  const tpls = templatesFileSchema.parse(JSON.parse(readFileSync("content/seed/templates.json", "utf8")));
  const by = new Map(tpls.map((t) => [t.key, t]));
  const ancestors = (k: string, seen = new Set<string>()): Set<string> => {
    for (const d of by.get(k)?.dependsOn ?? []) if (!seen.has(d)) { seen.add(d); ancestors(d, seen); }
    return seen;
  };
  it("F3: every BUDDY task depends on guest-sign-in", () => {
    const buddy = tpls.filter((t) => t.owner === "BUDDY");
    expect(buddy.length).toBeGreaterThan(0);
    for (const t of buddy) expect(ancestors(t.key).has("guest-sign-in")).toBe(true);
  });
  it("F5: device in Conditional offer, desk info in Unconditional offer", () => {
    expect(by.get("device-choice-submitted")!.stage).toBe("CONDITIONAL_OFFER");
    expect(by.get("read-workspace-info")!.stage).toBe("UNCONDITIONAL_OFFER");
  });
  it("F10: IT requests are LM-owned and keep the it-request key", () => {
    expect(by.get("raise-it-requests")!.owner).toBe("LM");
  });
  it("F12: peripherals are optional and never gating; the primary device still gates", () => {
    expect(by.get("choose-peripherals")).toMatchObject({ optional: true, gating: false, owner: "STARTER" });
    expect(by.get("device-choice-submitted")!.gating).toBe(true);
  });
  it("F4: reading tasks auto-complete; the exec video does not", () => {
    expect(by.get("read-contract-recap")!.autoCompleteOnOpen).toBe(true);
    expect(by.get("watch-executive-welcome")!.autoCompleteOnOpen).toBe(false);
  });
});
