/** Feedback round 1 through the real routes: F2, F4, F7, F8, F12, F16. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { seedDatabase } from "@/server/seed";
import * as js from "@/server/journey-service";
import { DEMO_COOKIE, signDemoSession } from "@/lib/auth/server";
import type { JourneyResponse } from "@/components/journey/types";
import type { BuddyResponse } from "@/components/journey/buddy-types";
import { GET as getJourney } from "./journey/route";
import { GET as getTask } from "./tasks/[id]/route";
import { POST as postStatus } from "./tasks/[id]/status/route";
import { POST as postOpen } from "./tasks/[id]/open/route";
import { GET as getGoals, POST as postGoal } from "./goals/route";
import { POST as postEquipment } from "./equipment/route";
import { GET as getBuddy } from "./buddy/route";

const ALEX = "alex-morgan";
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

const taskId = async (key: string, starter = ALEX) => (await prisma.task.findFirstOrThrow({ where: { key, journey: { starterId: starter } } })).id;
const journeyOf = async (starter = ALEX) => (await prisma.journey.findUniqueOrThrow({ where: { starterId: starter } })).id;
const complete = async (key: string, starter = ALEX) => js.completeTask(await journeyOf(starter), key, { actorId: "test" });

beforeAll(() => {
  process.env.AUTH_MODE = "demo";
});
afterAll(() => {
  process.env.AUTH_MODE = "";
});
beforeEach(async () => {
  await seedDatabase(prisma);
});

describe("F2 starter sees only their own tasks plus SYSTEM status rows", () => {
  it("filters LM, BUDDY and P&P tasks out of the DTO but still reports overall progress", async () => {
    const { body } = await call<JourneyResponse>(getJourney, ALEX, "/api/starter/journey");
    const owners = new Set(body.journey.tasks.map((t) => t.owner));
    expect([...owners].every((o) => o === "STARTER" || o === "SYSTEM")).toBe(true);
    expect(body.journey.tasks.some((t) => t.key === "allocate-buddy" || t.key === "raise-it-requests")).toBe(false);
    const hiddenTotal = Object.values(body.journey.overall!).reduce((n, s) => n + s.total, 0);
    expect(hiddenTotal).toBeGreaterThan(body.journey.tasks.filter((t) => !t.optional).length);
  });
  it("answers 404 for a manager task detail and never names hidden steps in a locked reason", async () => {
    expect((await call(getTask, ALEX, "/x", {}, ctx(await taskId("allocate-buddy")))).status).toBe(404);
    await prisma.journey.update({ where: { starterId: ALEX }, data: { currentStage: "UNCONDITIONAL_OFFER" } }); // test setup: reach the dependency branch
    const { body } = await call<JourneyResponse>(getJourney, ALEX, "/api/starter/journey");
    const confirm = body.journey.tasks.find((t) => t.key === "confirm-day-0-arrangements");
    expect(confirm?.lockedReason).toBe("Your line manager will share your first-day details here.");
    for (const t of body.journey.tasks) expect(t.lockedReason ?? "").not.toMatch(/Allocate a buddy|Propose Day 0/);
  });
});

describe("F4 auto-complete on open", () => {
  it("completes an eligible reading task once, through the service (audited)", async () => {
    await complete("guest-sign-in");
    const id = await taskId("read-contract-recap");
    const first = await call<{ completed: boolean }>(postOpen, ALEX, "/x", { method: "POST" }, ctx(id));
    expect(first.body.completed).toBe(true);
    expect((await prisma.task.findUniqueOrThrow({ where: { id } })).status).toBe("DONE");
    const events = await prisma.event.findMany({ where: { entityId: id, type: "TASK_STATUS_CHANGED" } });
    expect(events.some((e) => e.to === "DONE" && e.actorId === ALEX)).toBe(true);
    expect((await call<{ completed: boolean }>(postOpen, ALEX, "/x", { method: "POST" }, ctx(id))).body.completed).toBe(false);
  });
  it("does not complete a task that is not flagged, or a locked one", async () => {
    await complete("guest-sign-in");
    const res = await call<{ completed: boolean }>(postOpen, ALEX, "/x", { method: "POST" }, ctx(await taskId("say-hello-on-teams")));
    expect(res.body.completed).toBe(false);
  });
});

describe("F7 vetting failed blocks every starter action", () => {
  it("returns an empty list with the warning flag, and 409 for starter actions", async () => {
    await complete("guest-sign-in");
    await js.applyIntegrationStatus((await prisma.journey.findUniqueOrThrow({ where: { starterId: ALEX } })).id, "firstadvantage", "failed");
    const { body } = await call<JourneyResponse>(getJourney, ALEX, "/api/starter/journey");
    expect(body.journey.vettingFailed).toBe(true);
    expect(body.journey.tasks).toEqual([]);
    expect(body.journey.pnpPhone).toMatch(/0800 000 0000/);
    const res = await call<{ error: string }>(postStatus, ALEX, "/x", { method: "POST", body: { status: "DONE" } }, ctx(await taskId("say-hello-on-teams")));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("vetting_failed");
    expect((await call(getTask, ALEX, "/x", {}, ctx(await taskId("read-contract-recap")))).status).toBe(409);
  });
  it("action_needed keeps the normal view", async () => {
    await complete("guest-sign-in");
    await js.applyIntegrationStatus((await prisma.journey.findUniqueOrThrow({ where: { starterId: ALEX } })).id, "firstadvantage", "action_needed");
    const { body } = await call<JourneyResponse>(getJourney, ALEX, "/api/starter/journey");
    expect(body.journey.vettingFailed).toBe(false);
    expect(body.journey.tasks.length).toBeGreaterThan(0);
  });
});

describe("F8 goals locked before the start date", () => {
  it("is read-only for the starter (403) but still editable by the LM", async () => {
    const jid = (await prisma.journey.findUniqueOrThrow({ where: { starterId: ALEX } })).id;
    const g = await call<{ canEdit: boolean; lockedUntil: string | null }>(getGoals, ALEX, "/api/starter/goals");
    expect(g.body.canEdit).toBe(false);
    expect(g.body.lockedUntil).toBeTruthy();
    const post = await call<{ error: string }>(postGoal, ALEX, "/x", { method: "POST", body: { horizon: "30", text: "Learn the ropes" } });
    expect(post.status).toBe(403);
    expect(post.body.error).toBe("goals_locked");
    const lm = await call(postGoal, "dana-sample", "/x", { method: "POST", body: { journeyId: jid, horizon: "30", text: "Agree priorities" } });
    expect(lm.status).toBe(201);
  });
  it("opens from the start date", async () => {
    const jid = (await prisma.journey.findUniqueOrThrow({ where: { starterId: ALEX } })).id;
    await prisma.journey.update({ where: { id: jid }, data: { startDate: new Date(Date.now() - 86_400_000) } });
    const post = await call(postGoal, ALEX, "/x", { method: "POST", body: { horizon: "30", text: "Learn the ropes" } });
    expect(post.status).toBe(201);
  });
});

describe("F12 device and peripherals are separate tasks", () => {
  it("submits each part through the EquipmentAdapter; peripherals are optional and never gate", async () => {
    await complete("guest-sign-in");
    const periph = await prisma.task.findFirstOrThrow({ where: { key: "choose-peripherals", journey: { starterId: ALEX } } });
    expect(periph).toMatchObject({ optional: true, gating: false });
    // Peripherals need the device first.
    expect((await call(postEquipment, ALEX, "/x", { method: "POST", body: { taskId: periph.id, peripherals: ["Headset"] } })).status).toBe(409);
    const dev = await call<{ choice: { device: string } }>(postEquipment, ALEX, "/x", { method: "POST", body: { taskId: await taskId("device-choice-submitted"), device: "WINDOWS" } });
    expect(dev.status).toBe(200);
    expect(dev.body.choice.device).toBe("WINDOWS");
    const per = await call<{ choice: { device: string; peripherals: string[] } }>(postEquipment, ALEX, "/x", { method: "POST", body: { taskId: periph.id, peripherals: ["Headset", "Keyboard"] } });
    expect(per.body.choice).toMatchObject({ device: "WINDOWS", peripherals: ["Headset", "Keyboard"] });
  });
});

describe("F16 buddy sees only their own tasks", () => {
  it("lists every allocated starter with progress, and only BUDDY tasks for the selected one", async () => {
    const { status, body } = await call<BuddyResponse>(getBuddy, "kai-demo", "/api/starter/buddy");
    expect(status).toBe(200);
    expect(body.starters.length).toBeGreaterThanOrEqual(2);
    for (const s of body.starters) expect(s.progressPercent).toBeGreaterThanOrEqual(0);
    expect(body.tasks.length).toBeGreaterThan(0);
    expect(body.tasks.every((t) => t.owner === "BUDDY" || t.adapterKey === "itrequest")).toBe(true);
    const other = body.starters.find((s) => s.journeyId !== body.selectedId)!;
    const switched = await call<BuddyResponse>(getBuddy, "kai-demo", `/api/starter/buddy?journeyId=${other.journeyId}`);
    expect(switched.body.selectedId).toBe(other.journeyId);
  });
  it("gets no starter task detail, in the journey DTO or the task route", async () => {
    const jid = (await prisma.journey.findUniqueOrThrow({ where: { starterId: ALEX } })).id;
    const j = await call<JourneyResponse>(getJourney, "kai-demo", `/api/starter/journey?journeyId=${jid}`);
    expect(j.body.journey.tasks.every((t) => t.owner === "BUDDY" || t.adapterKey === "itrequest")).toBe(true);
    expect((await call(getTask, "kai-demo", "/x", {}, ctx(await taskId("read-contract-recap")))).status).toBe(404);
  });
});
