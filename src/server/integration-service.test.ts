import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./db";
import { seedDatabase } from "./seed";
import * as js from "./journey-service";
import { getAdapter } from "@/adapters/registry";
import { ColleagueFileIdMissingError } from "@/adapters/itrequest/types";
import { signDemoSession, DEMO_COOKIE } from "@/lib/auth/server";
import { resetDemoStarter, runDemoStep, runReminders, simulate, SimulationError } from "./integration-service";
import { GET as simulateList, POST as simulatePost } from "@/app/api/simulate/route";
import { GET as stateGet } from "@/app/api/simulate/state/route";
import { POST as tickPost } from "@/app/api/simulate/tick/route";
import { POST as demoPost } from "@/app/api/simulate/demo/route";
import { GET as notificationsGet } from "@/app/api/notifications/route";
import { POST as readPost } from "@/app/api/notifications/[id]/read/route";

const ALEX = "journey-alex-morgan";
const SAM = "journey-sam-ellery";
const task = async (journeyId: string, key: string) => (await js.loadJourney(journeyId))!.tasks.find((t) => t.key === key);

/** An external status never completes or blocks a LOCKED task, so get the journey to PEV first (the vetting task unlocks there). */
const toPev = async (journeyId: string) => {
  for (const key of ["guest-sign-in", "device-choice-submitted"]) await js.completeTask(journeyId, key, { actorId: "test" });
  expect((await js.loadJourney(journeyId))!.currentStage).toBe("PEV");
};

beforeAll(() => {
  process.env.AUTH_MODE = "demo";
});
afterAll(() => {
  process.env.AUTH_MODE = "";
});
beforeEach(async () => {
  await seedDatabase(prisma); // wipes and reloads, including IntegrationState
  await prisma.integrationState.deleteMany({ where: { journeyId: "GLOBAL" } });
});

describe("simulate: First Advantage (firstadvantage adapter)", () => {
  it("action_needed blocks the task, flags the journey and sends a reminder to the starter", async () => {
    await toPev(ALEX);
    const r = await simulate("firstadvantage", ALEX, "action_needed", undefined, { actorId: "admin-x" });
    expect(r.flagged).toBe(true);
    const t = await task(ALEX, "firstadvantage-vetting-status");
    expect(t!.status).toBe("BLOCKED");
    expect(r.changes.join(" ")).toMatch(/Reminder sent/);
    const mine = await (await getAdapter("notification")).list({ toUserId: "alex-morgan" });
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: "PEV_REMINDER", read: false, link: "/journey" });
    expect(mine[0].subject).toMatch(/First Advantage/);
    expect(mine[0].body).toMatch(/People & Places/);
    const types = (await js.listEvents(ALEX)).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["INTEGRATION_STATUS", "JOURNEY_FLAGGED", "REMINDER_SENT"]));
  });

  it("cleared completes the vetting task and unflags, but does not force the stage (D10)", async () => {
    await toPev(ALEX);
    await simulate("firstadvantage", ALEX, "action_needed");
    await simulate("firstadvantage", ALEX, "cleared");
    expect((await task(ALEX, "firstadvantage-vetting-status"))!.status).toBe("DONE");
    const j = (await js.loadJourney(ALEX))!;
    expect(j.flagged).toBe(false);
    expect(j.currentStage).not.toBe("UNCONDITIONAL_OFFER");
    expect((await task(ALEX, "offer-conditions-met"))!.status).not.toBe("DONE");
  });

  it("offer_conditions_met completes the guest sign-in prerequisite (with an event) and then advances the stage", async () => {
    await simulate("firstadvantage", ALEX, "cleared");
    expect((await task(ALEX, "guest-sign-in"))!.status).not.toBe("DONE");
    const r = await runDemoStep("offer_conditions_met", {}, ALEX);
    expect(r.changes.length).toBeGreaterThan(0);
    expect((await task(ALEX, "guest-sign-in"))!.status).toBe("DONE");
    expect((await task(ALEX, "offer-conditions-met"))!.status).toBe("DONE");
    expect((await js.loadJourney(ALEX))!.currentStage).toBe("UNCONDITIONAL_OFFER");
    expect((await js.listEvents(ALEX)).map((e) => e.type)).toContain("DEMO_PREREQUISITE");
  });

  it("runs the whole demo script in order: action needed, cleared, offer conditions, system tasks, Day 0", async () => {
    const flagged = await runDemoStep("firstadvantage_action_needed", {}, ALEX);
    expect(flagged.changes.join(" ")).toMatch(/flagged/);
    await runDemoStep("firstadvantage_cleared", {}, ALEX);
    expect((await js.loadJourney(ALEX))!.flagged).toBe(false);
    expect((await js.loadJourney(ALEX))!.currentStage).toBe("PEV");
    const oc = await runDemoStep("offer_conditions_met", {}, ALEX);
    expect(oc.changes.join(" ")).toMatch(/Stage moved from PEV to UNCONDITIONAL_OFFER/);
    const sys = await runDemoStep("system_tasks", {}, ALEX);
    expect(sys.message).toMatch(/IT request task/);
    await runDemoStep("jump_day0", {}, ALEX);
    expect((await js.loadJourney(ALEX))!.currentStage).toBe("DAY_0");
  });

  it("rejects unknown statuses and non-simulatable journeys", async () => {
    await expect(simulate("firstadvantage", ALEX, "bogus")).rejects.toBeInstanceOf(SimulationError);
    await expect(simulate("firstadvantage", "nope", "cleared")).rejects.toMatchObject({ status: 404 });
  });
});

describe("system tasks unlock IT requests (FR-3.1 to FR-3.3)", () => {
  it("completes account, persona and Colleague File ID, then IT requests can be raised", async () => {
    const itr = await getAdapter("itrequest");
    await expect(itr.raise(ALEX, "GitHub access")).rejects.toBeInstanceOf(ColleagueFileIdMissingError);
    await simulate("firstadvantage", ALEX, "cleared");
    await runDemoStep("offer_conditions_met", {}, ALEX);
    expect((await task(ALEX, "raise-it-requests"))!.status).toBe("LOCKED");

    const r = await runDemoStep("system_tasks", {}, ALEX);
    expect(r.message).toMatch(/IT request task/);
    for (const key of ["internal-account-created", "sailpoint-persona-applied", "colleague-file-id-created"]) {
      expect((await task(ALEX, key))!.status).toBe("DONE");
    }
    expect((await task(ALEX, "raise-it-requests"))!.status).not.toBe("LOCKED");
    expect((await itr.raise(ALEX, "GitHub access")).ref).toMatch(/^ITR-/);
  });

  it("completes pending system tasks as soon as they unlock, even if the external state came first", async () => {
    await simulate("identity", ALEX, "internal_created"); // vetting not cleared: the task is still locked
    expect((await task(ALEX, "internal-account-created"))!.status).toBe("LOCKED");
    await simulate("firstadvantage", ALEX, "cleared");
    await runDemoStep("offer_conditions_met", {}, ALEX);
    expect((await task(ALEX, "internal-account-created"))!.status).toBe("DONE");
  });
});

describe("demo helpers", () => {
  it("only runs jump_day0 and reset on the demo starter's journey (L1)", async () => {
    const before = (await js.loadJourney(SAM))!;
    for (const step of ["jump_day0", "reset"] as const) {
      await expect(runDemoStep(step, {}, SAM)).rejects.toMatchObject({ name: "SimulationError", status: 403 });
    }
    const after = (await js.loadJourney(SAM))!;
    expect(after.currentStage).toBe(before.currentStage);
    expect((await js.listEvents(SAM)).map((e) => e.type)).not.toContain("DEMO_RESET");
  });

  it("refuses to reset an exited journey that is not the demo starter's (L1)", async () => {
    await prisma.journey.update({ where: { id: SAM }, data: { status: "exited" } }); // test setup only
    await expect(resetDemoStarter(SAM)).rejects.toMatchObject({ status: 409 });
  });

  it("returns 403 from the route for another starter's journey (L1)", async () => {
    const admin = (await prisma.user.findMany()).find((u) => (u.roles as string[]).includes("ADMIN"))!.id;
    const r = await demoPost(
      new Request("http://localhost/api/simulate/demo", {
        method: "POST",
        headers: { cookie: `${DEMO_COOKIE}=${await signDemoSession(admin)}`, "content-type": "application/json" },
        body: JSON.stringify({ step: "reset", journeyId: SAM }),
      }),
      undefined,
    );
    expect(r.status).toBe(403);
  });

  it("jumps to Day 0 and resets to the start", async () => {
    await runDemoStep("jump_day0", {}, ALEX);
    expect((await js.loadJourney(ALEX))!.currentStage).toBe("DAY_0");
    const choice = await (await getAdapter("equipment")).getChoice(ALEX);
    expect(choice?.collectionPoint).toBeTruthy();

    await simulate("firstadvantage", ALEX, "failed").catch(() => undefined);
    await runDemoStep("reset", { actorId: "admin-x" }, ALEX);
    const j = (await js.loadJourney(ALEX))!;
    expect(j.currentStage).toBe("CONDITIONAL_OFFER");
    expect(j.flagged).toBe(false);
    expect((await task(ALEX, "guest-invite-sent"))!.status).toBe("DONE");
    expect((await (await getAdapter("firstadvantage")).getStatus(ALEX)).status).toBe("not_started");
    expect(await (await getAdapter("equipment")).getChoice(ALEX)).toBeNull();
    expect((await js.listEvents(ALEX)).map((e) => e.type)).toContain("DEMO_RESET");
  });
});

describe("runReminders (FR-2.2)", () => {
  const forSam = (r: Awaited<ReturnType<typeof runReminders>>) => r.sent.filter((s) => s.journeyId === SAM);

  it("reminds PEV starters who are not cleared, then suppresses within the window", async () => {
    const t0 = new Date("2026-11-09T09:00:00Z");
    expect(forSam(await runReminders(t0))).toHaveLength(1);
    const again = await runReminders(new Date(t0.getTime() + 3600_000));
    expect(forSam(again)).toHaveLength(0);
    expect(again.suppressed).toBeGreaterThan(0);
    expect(forSam(await runReminders(new Date(t0.getTime() + 25 * 3600_000)))).toHaveLength(1);
    expect(forSam(await runReminders(new Date(t0.getTime() + 26 * 3600_000), { force: true }))).toHaveLength(1);
    expect(forSam(await runReminders(new Date(t0.getTime() + 27 * 3600_000), { hours: 0.5 }))).toHaveLength(1);
    const inbox = await (await getAdapter("notification")).list({ toUserId: "sam-ellery" });
    expect(inbox.length).toBe(4);
    expect(inbox.every((n) => n.kind === "PEV_REMINDER" && /First Advantage/.test(n.subject))).toBe(true);
  });

  it("stops once First Advantage is cleared and skips journeys outside PEV", async () => {
    await simulate("firstadvantage", SAM, "cleared");
    const r = await runReminders(new Date("2026-11-09T09:00:00Z"));
    expect(forSam(r)).toHaveLength(0);
    expect(r.sent.some((s) => s.journeyId === ALEX)).toBe(false); // conditional offer, not started
  });
});

describe("route guards", () => {
  const as = async (userId: string | null, method: string, url: string, body?: unknown) =>
    new Request(`http://localhost${url}`, {
      method,
      headers: { ...(userId ? { cookie: `${DEMO_COOKIE}=${await signDemoSession(userId)}` } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const ctx = (id = "x") => ({ params: Promise.resolve({ id }) });

  it("returns 401 for anonymous callers and 403 for starters, LMs and buddies", async () => {
    const calls: [string, (r: Request) => Promise<Response>, string, string, unknown?][] = [
      ["list", (r) => simulateList(r, undefined), "GET", "/api/simulate"],
      ["simulate", (r) => simulatePost(r, undefined), "POST", "/api/simulate", { adapterKey: "firstadvantage", journeyId: ALEX, status: "cleared" }],
      ["state", (r) => stateGet(r, undefined), "GET", `/api/simulate/state?journeyId=${ALEX}`],
      ["tick", (r) => tickPost(r, undefined), "POST", "/api/simulate/tick", {}],
      ["demo", (r) => demoPost(r, undefined), "POST", "/api/simulate/demo", { step: "reset" }],
    ];
    for (const [name, fn, method, url, body] of calls) {
      expect((await fn(await as(null, method, url, body))).status, `${name} anonymous`).toBe(401);
      for (const who of ["alex-morgan", "dana-sample", "kai-demo"]) {
        expect((await fn(await as(who, method, url, body))).status, `${name} ${who}`).toBe(403);
      }
    }
    expect((await notificationsGet(await as(null, "GET", "/api/notifications"), undefined)).status).toBe(401);
    expect((await readPost(await as(null, "POST", "/api/notifications/x/read"), ctx())).status).toBe(401);
  });

  it("lets ADMIN and PNP simulate, tick and read state, and validates input", async () => {
    const admin = (await prisma.user.findMany()).find((u) => (u.roles as string[]).includes("ADMIN"))!.id;
    const pnp = (await prisma.user.findMany()).find((u) => (u.roles as string[]).includes("PNP"))!.id;
    await toPev(ALEX);
    const ok = await simulatePost(await as(admin, "POST", "/api/simulate", { adapterKey: "firstadvantage", journeyId: ALEX, status: "action_needed" }), undefined);
    expect(ok.status).toBe(200);
    expect((await ok.json()).flagged).toBe(true);
    expect((await simulatePost(await as(pnp, "POST", "/api/simulate", { adapterKey: "firstadvantage", journeyId: ALEX, status: "bogus" }), undefined)).status).toBe(400);
    expect((await simulatePost(await as(pnp, "POST", "/api/simulate", { adapterKey: "nope", journeyId: ALEX, status: "x" }), undefined)).status).toBe(400);
    expect((await simulatePost(await as(pnp, "POST", "/api/simulate", { adapterKey: "firstadvantage", journeyId: "missing", status: "cleared" }), undefined)).status).toBe(404);
    const state = await (await stateGet(await as(pnp, "GET", `/api/simulate/state?journeyId=${ALEX}`), undefined)).json();
    expect(state.adapters.map((a: { key: string }) => a.key)).toContain("sailpoint");
    expect(state.journey.flagged).toBe(true);
    const tick = await tickPost(await as(admin, "POST", "/api/simulate/tick", { force: true }), undefined);
    expect(tick.status).toBe(200);
    expect(Array.isArray((await tick.json()).sent)).toBe(true);
    expect((await demoPost(await as(admin, "POST", "/api/simulate/demo", { step: "reset" }), undefined)).status).toBe(200);
    expect((await demoPost(await as(admin, "POST", "/api/simulate/demo", { step: "bogus" }), undefined)).status).toBe(400);
    const bad = new Request("http://localhost/api/simulate/tick", {
      method: "POST",
      headers: { cookie: `${DEMO_COOKIE}=${await signDemoSession(admin)}`, "content-type": "application/json" },
      body: "{not json",
    });
    expect((await tickPost(bad, undefined)).status).toBe(400);
  });

  it("notifications are per user: list own, mark own read, 404 for others", async () => {
    await runDemoStep("firstadvantage_action_needed", {}, ALEX); // Alex reaches vetting first (D32), then the reminder is sent
    const res = await (await notificationsGet(await as("alex-morgan", "GET", "/api/notifications"), undefined)).json();
    expect(res.unread).toBe(1);
    expect(res.notifications[0]).toMatchObject({ type: "PEV_REMINDER", read: false, link: "/journey" });
    const id = res.notifications[0].id;
    const other = await (await notificationsGet(await as("dana-sample", "GET", "/api/notifications"), undefined)).json();
    expect(other.notifications).toHaveLength(0);
    expect((await readPost(await as("dana-sample", "POST", `/api/notifications/${id}/read`), ctx(id))).status).toBe(404);
    expect((await readPost(await as("alex-morgan", "POST", `/api/notifications/${id}/read`), ctx(id))).status).toBe(200);
    const after = await (await notificationsGet(await as("alex-morgan", "GET", "/api/notifications"), undefined)).json();
    expect(after.unread).toBe(0);
    expect((await js.listEvents(ALEX)).map((e) => e.type)).toContain("NOTIFICATION_READ");
  });
});
