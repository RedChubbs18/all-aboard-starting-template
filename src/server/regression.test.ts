/**
 * Regression tests that run against the REAL seeded content (content/seed/templates.json and people.json via
 * seedDatabase), because the synthetic fixtures in src/domain/test-fixtures.ts hid these bugs.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./db";
import { seedDatabase } from "./seed";
import * as js from "./journey-service";
import * as admin from "./admin-service";
import { classifyTask, getExitReport } from "./mi-service";
import { orderPassAfterRecertification, reconcileSystemTasks, resetDemoStarter, runDemoStep, simulate } from "./integration-service";
import { handleOfferAccepted } from "./workday-service";
import { getAdapter, setAdapterMode } from "@/adapters/registry";
import { DEMO_COOKIE, signDemoSession } from "@/lib/auth/server";
import { POST as inviteResult } from "@/app/api/admin/seed-starter/[journeyId]/invite-result/route";
import { POST as withdraw } from "@/app/api/starter/withdraw/route";
import { WITHDRAW_REASONS } from "@/components/journey/withdraw";
import { COLLEAGUE_REASONS } from "@/domain/exit-reasons";

const ALEX = "journey-alex-morgan";
const ADMIN = "ada-sample";
const GUID = "11111111-2222-3333-4444-555555555555";
const status = async (journeyId: string, key: string) => (await js.loadJourney(journeyId))!.tasks.find((t) => t.key === key)!.status;
const types = async (journeyId: string) => (await js.listEvents(journeyId)).map((e) => e.type);

let n = 0;
const seedStarter = (opts: { deferInvite?: boolean; buddyId?: string } = {}) =>
  admin.seedNewStarter(
    ADMIN,
    { displayName: `Reg Starter ${++n}`, upn: `reg.starter${n}@example.test`, teamId: "dwe", lmId: "dana-sample", buddyId: opts.buddyId, startDate: "2027-01-11" },
    { deferInvite: opts.deferInvite },
  );

async function postInvite(journeyId: string, body: unknown) {
  const cookie = `${DEMO_COOKIE}=${await signDemoSession(ADMIN)}`;
  return inviteResult(
    new Request(`http://localhost/api/admin/seed-starter/${journeyId}/invite-result`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ journeyId }) },
  );
}

beforeAll(() => {
  process.env.AUTH_MODE = "demo";
});
afterAll(() => {
  process.env.AUTH_MODE = "";
});
beforeEach(async () => {
  await seedDatabase(prisma);
});

describe("seeded starter: guest invite (items 1 and 2)", () => {
  it("completes guest-invite-sent after a successful (mock) invite, with an audit event, and unlocks the LM tasks", async () => {
    const r = await seedStarter();
    expect(await status(r.journeyId, "guest-invite-sent")).toBe("DONE");
    expect(await status(r.journeyId, "allocate-buddy")).toBe("TODO"); // LM work is unlocked by the invite
    const ev = (await js.listEvents(r.journeyId)).find((e) => e.type === "TASK_STATUS_CHANGED" && (e.data as { key?: string } | null)?.key === "guest-invite-sent");
    expect(ev).toMatchObject({ actorId: ADMIN, to: "DONE" });
  });

  it("a Graph invite report maps the guest object id to the starter and completes the task", async () => {
    const r = await seedStarter({ deferInvite: true });
    expect(await status(r.journeyId, "guest-invite-sent")).not.toBe("DONE");
    expect((await postInvite(r.journeyId, { status: "invited", guestObjectId: GUID })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: r.starterId } })).entraOid).toBe(GUID);
    expect(await status(r.journeyId, "guest-invite-sent")).toBe("DONE");
  });

  it("the demo fallback also completes the task", async () => {
    const r = await seedStarter({ deferInvite: true });
    expect((await postInvite(r.journeyId, { status: "fallback", reason: "not_approved" })).status).toBe(200);
    expect(await status(r.journeyId, "guest-invite-sent")).toBe("DONE");
  });

  it("refuses (409) a guest object id already linked to another user, without recording the invite", async () => {
    const first = await seedStarter({ deferInvite: true });
    await postInvite(first.journeyId, { status: "invited", guestObjectId: GUID });
    const second = await seedStarter({ deferInvite: true });
    const res = await postInvite(second.journeyId, { status: "invited", guestObjectId: GUID });
    expect(res.status).toBe(409);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: second.starterId } })).entraOid).toBeNull();
    expect(await status(second.journeyId, "guest-invite-sent")).not.toBe("DONE");
  });
});

describe("LM actions complete their tasks (item 4)", () => {
  it("allocateBuddy completes allocate-buddy in the same transaction as its event", async () => {
    const r = await seedStarter();
    expect(await status(r.journeyId, "allocate-buddy")).toBe("TODO");
    await js.allocateBuddy(r.journeyId, "kai-demo", "dana-sample");
    expect(await status(r.journeyId, "allocate-buddy")).toBe("DONE");
    expect(await types(r.journeyId)).toEqual(expect.arrayContaining(["BUDDY_ALLOCATED", "TASK_STATUS_CHANGED"]));
    await js.allocateBuddy(r.journeyId, "mira-placeholder", "dana-sample"); // re-allocating (task already DONE) is fine
    expect(await status(r.journeyId, "allocate-buddy")).toBe("DONE");
  });

  it("proposeDay0 completes propose-day-0-arrangements (and so unlocks the starter's confirmation)", async () => {
    await toUnconditional();
    expect(await status(ALEX, "propose-day-0-arrangements")).toBe("TODO");
    await js.proposeDay0(ALEX, { where: "Reception", whenAt: new Date("2026-12-07T09:00:00Z"), who: "Dana" }, "dana-sample");
    expect(await status(ALEX, "propose-day-0-arrangements")).toBe("DONE");
    expect(await status(ALEX, "confirm-day-0-arrangements")).toBe("TODO");
    expect(await types(ALEX)).toEqual(expect.arrayContaining(["DAY0_PROPOSED", "TASK_STATUS_CHANGED"]));
    await js.proposeDay0(ALEX, { where: "Atrium", whenAt: new Date("2026-12-07T09:00:00Z"), who: "Dana" }, "dana-sample");
    expect(await status(ALEX, "propose-day-0-arrangements")).toBe("DONE");
  });

  it("a proposal made while the task is still locked is completed by the next reconcile (reconcile rule)", async () => {
    await js.proposeDay0(ALEX, { where: "Reception", whenAt: new Date("2026-12-07T09:00:00Z"), who: "Dana" }, "dana-sample");
    expect(await status(ALEX, "propose-day-0-arrangements")).toBe("LOCKED");
    await toUnconditional(); // the demo steps reconcile as the stage is reached
    expect(await status(ALEX, "propose-day-0-arrangements")).toBe("DONE");
    expect(await reconcileSystemTasks(ALEX)).toEqual([]); // nothing left to do
  });
});

describe("external statuses and the real templates (item 5)", () => {
  it("equipment `ordered` during CONDITIONAL_OFFER does not complete Day 0 tasks", async () => {
    await simulate("equipment", ALEX, "ordered");
    const j = (await js.loadJourney(ALEX))!;
    expect(j.currentStage).toBe("CONDITIONAL_OFFER");
    for (const t of j.tasks.filter((x) => x.stage === "DAY_0")) expect(t.status, t.key).not.toBe("DONE");
    expect(await status(ALEX, "collect-equipment")).toBe("LOCKED");
  });

  it("a `cleared` result that arrives while vetting is still locked completes the task once it unlocks", async () => {
    await simulate("firstadvantage", ALEX, "cleared");
    expect(await status(ALEX, "firstadvantage-vetting-status")).toBe("LOCKED");
    await runDemoStep("offer_conditions_met", {}, ALEX);
    expect(await status(ALEX, "firstadvantage-vetting-status")).toBe("DONE");
  });
});

/** Alex at UNCONDITIONAL_OFFER (account created, nothing else done). */
async function toUnconditional() {
  await simulate("firstadvantage", ALEX, "cleared");
  await runDemoStep("offer_conditions_met", {}, ALEX);
  await runDemoStep("system_tasks", {}, ALEX);
  expect((await js.loadJourney(ALEX))!.currentStage).toBe("UNCONDITIONAL_OFFER");
}

/** Alex at UNCONDITIONAL_OFFER with Day 0 proposed and confirmed. */
async function alexAtUnconditional() {
  await toUnconditional();
  await js.proposeDay0(ALEX, { where: "Example Office, Floor 3 reception", whenAt: new Date("2026-12-07T09:00:00Z"), who: "Dana" }, "dana-sample");
  await js.confirmDay0(ALEX, "alex-morgan");
  await js.completeTask(ALEX, "confirm-day-0-arrangements", { actorId: "alex-morgan" });
}

describe("photo recertification end to end (item 3)", () => {
  it("after an override the journey is unflagged and the pass order proceeds", async () => {
    await alexAtUnconditional();
    expect(await status(ALEX, "order-photo-id-pass")).toBe("LOCKED");
    await js.requestPhotoReview(ALEX, { actorId: "alex-morgan", detail: "Sunglasses" });
    let j = (await js.loadJourney(ALEX))!;
    expect(j.flagged).toBe(true);
    expect(j.tasks.find((t) => t.key === "photo-check-override")!.status).toBe("TODO");
    expect(await orderPassAfterRecertification(ALEX)).toBe(false); // not overridden yet

    await js.completeTask(ALEX, "photo-check-override", { actorId: "dana-sample" });
    expect(await status(ALEX, "order-photo-id-pass")).toBe("TODO");
    expect(await orderPassAfterRecertification(ALEX, { actorId: "dana-sample" })).toBe(true);
    j = (await js.loadJourney(ALEX))!;
    expect(j.tasks.find((t) => t.key === "order-photo-id-pass")!.status).toBe("DONE");
    expect(j.tasks.find((t) => t.key === "upload-pass-photo")!.status).toBe("DONE");
    expect(j.flagged).toBe(false);
    expect((await (await getAdapter("pass")).getOrder(ALEX))?.location).toBe("Example Office, Floor 3 reception");
    expect(js.computeProgress(j).blocked).toEqual([]);
    expect(await orderPassAfterRecertification(ALEX)).toBe(false); // idempotent
  });
});

describe("withdraw comment (item 7) and reasons (item 12)", () => {
  it("stores reasonSource and comment on JOURNEY_EXITED (no separate detail event) and MI shows the comment", async () => {
    const cookie = `${DEMO_COOKIE}=${await signDemoSession("alex-morgan")}`;
    const res = await withdraw(
      new Request("http://localhost/api/starter/withdraw", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ reason: "ROLE_NOT_RIGHT", comment: "  Different team than I expected  " }) }),
      undefined,
    );
    expect(res.status).toBe(200);
    const evs = await js.listEvents(ALEX);
    expect(evs.map((e) => e.type)).not.toContain("JOURNEY_EXIT_DETAIL");
    expect(evs.find((e) => e.type === "JOURNEY_EXITED")!.data).toMatchObject({ reason: "ROLE_NOT_RIGHT", reasonSource: "COLLEAGUE", comment: "Different team than I expected" });
    const row = (await getExitReport({})).rows.find((r) => r.journeyId === ALEX)!;
    expect(row).toMatchObject({ reason: "ROLE_NOT_RIGHT", reasonSource: "COLLEAGUE", comment: "Different team than I expected" });
  });

  it("withdraw options are exactly the colleague exit reasons", () => {
    expect(WITHDRAW_REASONS.map((r) => r.value)).toEqual([...COLLEAGUE_REASONS]);
    expect(WITHDRAW_REASONS.every((r) => r.label.length > 0)).toBe(true);
  });
});

describe("demo steps (items 8, 9, 13, 14)", () => {
  it("reset also clears Day 0, goals, check-ins and events, leaving only DEMO_RESET", async () => {
    await js.proposeDay0(ALEX, { where: "Reception", whenAt: new Date("2026-12-07T09:00:00Z"), who: "Dana" }, "dana-sample");
    await js.addGoal(ALEX, { horizon: "SEVEN", text: "Meet the team" } as never, "dana-sample");
    await js.upsertCheckIn(ALEX, { cadence: "WEEKLY", scheduledAt: new Date("2026-12-14T10:00:00Z") }, "dana-sample");
    expect(await prisma.event.count({ where: { journeyId: ALEX } })).toBeGreaterThan(1);
    await runDemoStep("reset", { actorId: ADMIN }, ALEX);
    expect(await prisma.day0Arrangement.count({ where: { journeyId: ALEX } })).toBe(0);
    expect(await prisma.goal.count({ where: { journeyId: ALEX } })).toBe(0);
    expect(await prisma.checkIn.count({ where: { journeyId: ALEX } })).toBe(0);
    expect(await types(ALEX)).toEqual(["DEMO_RESET"]);
  });

  it("system_tasks still works when identity is REAL (direct completion with DEMO_SIMULATED) and completes Eptura Engage", async () => {
    await simulate("firstadvantage", ALEX, "cleared");
    await runDemoStep("offer_conditions_met", {}, ALEX);
    await setAdapterMode("identity", "REAL");
    const r = await runDemoStep("system_tasks", {}, ALEX);
    expect(r.message).toMatch(/Eptura/);
    for (const key of ["internal-account-created", "sailpoint-persona-applied", "colleague-file-id-created", "eptura-engage-access"]) {
      expect(await status(ALEX, key), key).toBe("DONE");
    }
    const simulated = (await js.listEvents(ALEX)).filter((e) => e.type === "DEMO_SIMULATED").map((e) => (e.data as { key: string }).key);
    expect(simulated).toEqual(expect.arrayContaining(["internal-account-created", "eptura-engage-access"]));
  });

  it("system_tasks completes Eptura Engage in MOCK mode too (the account rule)", async () => {
    await simulate("firstadvantage", ALEX, "cleared");
    await runDemoStep("offer_conditions_met", {}, ALEX);
    await simulate("identity", ALEX, "internal_created");
    expect(await status(ALEX, "eptura-engage-access")).toBe("DONE");
  });

  it("a journey created by the mock Workday webhook can use reset and jump_day0; other starters still cannot", async () => {
    const { journeyId } = await handleOfferAccepted(
      JSON.stringify({
        offerId: "wd-offer-demo", candidate: { firstName: "Jo", lastName: "Bloggs" }, jobTitle: "Engineer", jobFamily: "ENGINEERING", teamKey: "dwe", lineManagerKey: "dana-sample",
        startDate: "2027-01-11", conditions: [], guest: { objectId: "8d5f1c1e-5b0a-4c53-9a53-0b6a4f3c2d11", inviteStatus: "invited" },
      }),
    );
    await expect(runDemoStep("jump_day0", {}, "journey-sam-ellery")).rejects.toMatchObject({ status: 403 });
    await runDemoStep("jump_day0", { actorId: ADMIN }, journeyId);
    expect((await js.loadJourney(journeyId))!.currentStage).toBe("DAY_0");
    await runDemoStep("reset", { actorId: ADMIN }, journeyId);
    expect((await js.loadJourney(journeyId))!.currentStage).toBe("CONDITIONAL_OFFER");
    // Still a demo journey afterwards (the workday-offer link row survives the reset), and the webhook stays idempotent.
    expect(await prisma.integrationState.count({ where: { journeyId, adapterKey: "workday-offer" } })).toBe(1);
    await expect(resetDemoStarter(journeyId)).resolves.toBeTruthy();
  });
});

describe("overdue consistency (item 10)", () => {
  it("MI classifies the same way as the engine: LOCKED and override-satisfied tasks are not overdue", async () => {
    await alexAtUnconditional();
    await js.requestPhotoReview(ALEX, { actorId: "alex-morgan" });
    await js.completeTask(ALEX, "photo-check-override", { actorId: "dana-sample" });
    const j = (await js.loadJourney(ALEX))!;
    const later = new Date("2030-01-01T00:00:00Z");
    const passed = j.tasks.find((t) => t.key === "photo-check-passed")!;
    expect(classifyTask(passed, undefined, later, j.tasks)).toBeNull();
    // First Advantage has cleared by now (the colleague was invited), so D32 does not hide its tasks from MI.
    const fromMi = j.tasks.filter((t) => classifyTask(t, t.adapterKey === "firstadvantage" ? "cleared" : undefined, later, j.tasks) === "OVERDUE").map((t) => t.key).sort();
    const fromEngine = js.computeProgress(j, later).overdue.filter((t) => t.status !== "BLOCKED").map((t) => t.key).sort();
    expect(fromMi).toEqual(fromEngine);
    expect(j.tasks.filter((t) => t.status === "LOCKED").length).toBeGreaterThan(0);
  });
});
