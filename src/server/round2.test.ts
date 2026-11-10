/**
 * Round-2 server behaviour against the real seeded content: D29 entitlement, D31 timing, D32 vetting invitation.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./db";
import { seedDatabase } from "./seed";
import * as js from "./journey-service";
import * as admin from "./admin-service";
import { classifyTask } from "./mi-service";
import { runDemoStep, runReminders, simulate } from "./integration-service";
import { getAdapter } from "@/adapters/registry";
import { DEMO_COOKIE, signDemoSession } from "@/lib/auth/server";
import { goalsLockedUntil } from "@/app/api/starter/_lib/goals";
import type { JourneyResponse } from "@/components/journey/types";
import type { TaskDetailResponse } from "@/components/journey/detail-types";
import type { StarterSummary } from "@/components/lm/types";
import { GET as getJourney } from "@/app/api/starter/journey/route";
import { GET as getTask } from "@/app/api/starter/tasks/[id]/route";
import { POST as postEquipment } from "@/app/api/starter/equipment/route";
import { GET as lmList } from "@/app/api/lm/starters/route";

const ALEX = "alex-morgan";
const ALEX_J = "journey-alex-morgan";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function call<T>(handler: (r: Request, c: never) => Promise<Response>, user: string, path: string, init: { method?: string; body?: unknown } = {}, c?: unknown) {
  const req = new Request(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers: { cookie: `${DEMO_COOKIE}=${await signDemoSession(user)}`, "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const res = await handler(req, (c ?? undefined) as never);
  return { status: res.status, body: (await res.json()) as T };
}

const task = async (key: string, journeyId = ALEX_J) => (await js.loadJourney(journeyId))!.tasks.find((t) => t.key === key)!;
const taskId = async (key: string, journeyId = ALEX_J) => (await task(key, journeyId)).id;
const toPev = async (journeyId = ALEX_J) => {
  for (const key of ["guest-sign-in", "device-choice-submitted"]) await js.completeTask(journeyId, key, { actorId: "test" });
  expect((await js.loadJourney(journeyId))!.currentStage).toBe("PEV");
};
const alexLm = async () => {
  const r = await call<{ starters: StarterSummary[] }>(lmList, "dana-sample", "/api/lm/starters");
  return r.body.starters.find((s) => s.id === ALEX_J)!;
};

beforeAll(() => {
  process.env.AUTH_MODE = "demo";
});
afterAll(() => {
  process.env.AUTH_MODE = "";
});
beforeEach(async () => {
  await seedDatabase(prisma);
});

describe("D29 device entitlement", () => {
  it("offers an engineer the two high-spec models and a non-engineer the two standard models", async () => {
    await js.completeTask(ALEX_J, "guest-sign-in", { actorId: "test" });
    const eng = await call<TaskDetailResponse>(getTask, ALEX, "/x", {}, ctx(await taskId("device-choice-submitted")));
    expect(eng.body.detail).toMatchObject({ kind: "order", models: [{ label: "MacBook Pro M5 Pro" }, { label: "HP EliteBook U7" }] });

    const r = await admin.seedNewStarter("ada-sample", { displayName: "Ops Starter", upn: "ops.starter@example.test", teamId: "ops", lmId: "harriet-demo", startDate: "2099-01-04", jobFamily: "OPERATIONS" });
    await js.completeTask(r.journeyId, "guest-sign-in", { actorId: "test" });
    const dev = await taskId("device-choice-submitted", r.journeyId);
    const std = await call<TaskDetailResponse>(getTask, r.starterId, "/x", {}, ctx(dev));
    expect(std.body.detail).toMatchObject({ kind: "order", models: [{ label: "MacBook Air M5" }, { label: "HP EliteBook U5" }] });
    // The high-spec model is refused for them, the standard one accepted.
    expect((await call(postEquipment, r.starterId, "/x", { method: "POST", body: { taskId: dev, modelId: "mbp-m5-pro" } })).status).toBe(422);
    const ok = await call<{ choice: { model: string; device: string } }>(postEquipment, r.starterId, "/x", { method: "POST", body: { taskId: dev, modelId: "mba-m5" } });
    expect(ok.body.choice).toMatchObject({ model: "MacBook Air M5", device: "MAC" });
  });

  it("collect equipment shows the chosen model", async () => {
    await js.completeTask(ALEX_J, "guest-sign-in", { actorId: "test" });
    await call(postEquipment, ALEX, "/x", { method: "POST", body: { taskId: await taskId("device-choice-submitted"), modelId: "mbp-m5-pro" } });
    const r = await call<TaskDetailResponse>(getTask, ALEX, "/x", {}, ctx(await taskId("collect-equipment")));
    expect(r.body.detail).toMatchObject({ kind: "collect", choice: { model: "MacBook Pro M5 Pro" } });
  });

  it("the demo steps order the model the starter is entitled to", async () => {
    await runDemoStep("firstadvantage_action_needed", {}, ALEX_J);
    const eq = await (await import("@/adapters/registry")).getAdapter("equipment");
    expect((await eq.getChoice(ALEX_J))?.model).toBe("MacBook Pro M5 Pro");
  });
});

describe("D31 stage timing", () => {
  const FAR = new Date("2099-01-04T00:00:00Z");

  /** Alex with a far-off start date and every pre-Day-0 task done (the clock is still before the start date). */
  async function finishPreDay0() {
    await prisma.journey.update({ where: { id: ALEX_J }, data: { startDate: FAR } });
    await runDemoStep("firstadvantage_cleared", {}, ALEX_J);
    await runDemoStep("offer_conditions_met", {}, ALEX_J);
    await runDemoStep("system_tasks", {}, ALEX_J);
    for (let i = 0; i < 40; i++) {
      const open = (await js.loadJourney(ALEX_J))!.tasks.find((t) => t.applicable && t.stage !== "DAY_0" && t.stage !== "DAY_30" && ["TODO", "IN_PROGRESS", "BLOCKED"].includes(t.status));
      if (!open) break;
      await js.completeTask(ALEX_J, open.key, { actorId: "test" });
    }
  }

  it("the starter view says when Day 0 unlocks, even when every earlier task is done", async () => {
    await finishPreDay0();
    expect((await js.loadJourney(ALEX_J))!.currentStage).toBe("UNCONDITIONAL_OFFER");
    const dto = (await call<JourneyResponse>(getJourney, ALEX, "/api/starter/journey")).body.journey;
    const locked = dto.tasks.find((t) => t.stage === "DAY_0" && t.status === "LOCKED")!;
    expect(locked.lockedReason).toBe("Unlocks on Sunday 4 January.");
  });

  it("settleForTime opens Day 0 once the start date arrives, and is a no-op before", async () => {
    await finishPreDay0();
    const before = (await js.loadJourney(ALEX_J))!;
    expect(before.currentStage).toBe("UNCONDITIONAL_OFFER");
    expect((await js.settleForTime(before, new Date("2098-12-31T00:00:00Z"))).currentStage).toBe("UNCONDITIONAL_OFFER");
    expect((await js.settleForTime(before, FAR)).currentStage).toBe("DAY_0");
    expect((await js.loadJourney(ALEX_J))!.currentStage).toBe("DAY_0"); // persisted
  });

  it("goals unlock on the same day as Day 0 (D21)", () => {
    const j = { starterId: "s", lmId: "l", buddyId: null, startDate: FAR };
    const starter = { id: "s", roles: ["STARTER"] as never };
    expect(goalsLockedUntil(starter, j, new Date("2099-01-03T23:59:59Z"))).not.toBeNull();
    expect(goalsLockedUntil(starter, j, FAR)).toBeNull();
  });

  it("'Jump to Day 0' moves the demo start date to today first, and reset puts the original back", async () => {
    const original = (await js.loadJourney(ALEX_J))!.startDate;
    expect(original.getTime()).toBeGreaterThan(Date.now() - 86_400_000);
    await prisma.journey.update({ where: { id: ALEX_J }, data: { startDate: FAR } });
    const r = await runDemoStep("jump_day0", {}, ALEX_J);
    expect(r.changes.join(" ")).toMatch(/Start date moved to today/);
    const j = (await js.loadJourney(ALEX_J))!;
    expect(j.currentStage).toBe("DAY_0");
    const today = new Date();
    expect(j.startDate.toISOString().slice(0, 10)).toBe(today.toISOString().slice(0, 10));
    expect(goalsLockedUntil({ id: "alex-morgan", roles: ["STARTER"] as never }, j)).toBeNull();
    await runDemoStep("reset", {}, ALEX_J);
    expect((await js.loadJourney(ALEX_J))!.startDate.toISOString()).toBe(FAR.toISOString());
  });
});

describe("D32 vetting before the invitation", () => {
  it("shows no First Advantage status, only timing, until the colleague is invited", async () => {
    await toPev();
    const dto = async () => (await call<JourneyResponse>(getJourney, ALEX, "/api/starter/journey")).body.journey;
    expect((await dto()).firstadvantage).toBeNull(); // PEV reached, status not started
    const detail = await call<TaskDetailResponse>(getTask, ALEX, "/x", {}, ctx(await taskId("firstadvantage-vetting-status")));
    expect(detail.body.detail).toMatchObject({ kind: "firstadvantage", status: { status: "not_started" } });
    await simulate("firstadvantage", ALEX_J, "in_progress");
    expect((await dto()).firstadvantage).toMatchObject({ status: "in_progress" });
  });

  it("an action_needed signal before PEV is recorded, not applied; it applies on reaching PEV", async () => {
    await simulate("firstadvantage", ALEX_J, "action_needed");
    let j = (await js.loadJourney(ALEX_J))!;
    expect(j.flagged).toBe(false);
    expect((await task("complete-vetting-steps")).status).toBe("LOCKED");
    expect((await prisma.integrationState.findUniqueOrThrow({ where: { journeyId_adapterKey: { journeyId: ALEX_J, adapterKey: "firstadvantage" } } })).status).toBe("action_needed");
    // Neither the starter nor the LM sees it yet, and no reminder went out.
    expect((await call<JourneyResponse>(getJourney, ALEX, "/api/starter/journey")).body.journey.firstadvantage).toBeNull();
    const lm = await alexLm();
    expect(lm.redFlag).toBe(false);
    expect(lm.firstadvantage).toBeNull();
    expect(await (await getAdapter("notification")).list({ journeyId: ALEX_J })).toHaveLength(0);

    await toPev();
    j = (await js.loadJourney(ALEX_J))!;
    expect(j.flagged).toBe(true);
    expect((await task("complete-vetting-steps")).status).toBe("BLOCKED");
    expect((await prisma.event.findMany({ where: { journeyId: ALEX_J, type: "VETTING_SIGNAL_APPLIED" } })).length).toBe(1);
    const after = await alexLm();
    expect(after.redFlag).toBe(true);
    expect(after.firstadvantage).toBe("ACTION_NEEDED");
  });

  it("a failed signal before PEV refers to P&P on reaching PEV", async () => {
    await simulate("firstadvantage", ALEX_J, "failed");
    expect((await js.loadJourney(ALEX_J))!.flagged).toBe(false);
    await toPev();
    const t = await task("firstadvantage-vetting-status");
    expect(t).toMatchObject({ status: "BLOCKED", owner: "PNP" });
  });

  it("not started in PEV is not an LM red flag or an MI issue even when the task is past due", async () => {
    await toPev();
    const j = (await js.loadJourney(ALEX_J))!;
    const vetting = j.tasks.find((t) => t.key === "complete-vetting-steps")!;
    const far = new Date(vetting.dueDate.getTime() + 30 * 86_400_000);
    expect(classifyTask(vetting, undefined, far, j.tasks)).toBeNull();
    expect(classifyTask(vetting, "not_started", far, j.tasks)).toBeNull();
    expect(classifyTask(vetting, "in_progress", far, j.tasks)).toBe("OVERDUE");
    const lm = await alexLm();
    expect(lm.redFlag).toBe(false);
  });

  it("the reminder tick leaves colleagues who have not been invited alone", async () => {
    await toPev();
    const r = await runReminders(new Date(), { force: true });
    expect(r.sent.find((s) => s.journeyId === ALEX_J)).toBeUndefined();
    await simulate("firstadvantage", ALEX_J, "in_progress");
    const r2 = await runReminders(new Date(), { force: true });
    expect(r2.sent.find((s) => s.journeyId === ALEX_J)).toBeDefined();
  });
});
