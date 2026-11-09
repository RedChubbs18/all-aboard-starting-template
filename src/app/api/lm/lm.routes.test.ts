/**
 * LM API route tests: scoping (LM A cannot touch LM B's starter), buddy allocation rules,
 * bespoke tasks appearing on the journey, check-in links, Day 0, goals and team call links.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { DEMO_COOKIE, signDemoSession } from "@/lib/auth/server";
import { prisma } from "@/server/db";
import { createJourneyForStarter, listEvents, loadJourney } from "@/server/journey-service";
import { GET as listGET } from "./starters/route";
import { GET as detailGET } from "./starters/[journeyId]/route";
import { POST as buddyPOST } from "./starters/[journeyId]/buddy/route";
import { POST as taskPOST } from "./starters/[journeyId]/tasks/route";
import { POST as teamItemPOST } from "./starters/[journeyId]/team-items/route";
import { exitJourney } from "@/server/journey-service";
import { PATCH as taskPATCH } from "./starters/[journeyId]/tasks/[key]/route";
import { PUT as day0PUT } from "./starters/[journeyId]/day0/route";
import { POST as checkInPOST } from "./starters/[journeyId]/check-ins/route";
import { POST as photoPOST } from "./starters/[journeyId]/photo-override/route";
import { POST as goalPOST } from "./starters/[journeyId]/goals/route";
import { PATCH as goalPATCH } from "./starters/[journeyId]/goals/[goalId]/route";
import type { StarterDetail, StarterListResponse } from "@/components/lm/types";

const P = "lmr-";
const id = (s: string) => `${P}${s}`;
let jA = "";
let jB = "";

async function call<T = unknown>(
  as: string,
  handler: (req: Request, ctx: never) => Promise<Response>,
  opts: { body?: unknown; method?: string; params?: Record<string, string> } = {},
) {
  process.env.AUTH_MODE = "demo";
  const token = await signDemoSession(id(as));
  const req = new Request("http://localhost/api/lm", {
    method: opts.method ?? "GET",
    headers: { cookie: `${DEMO_COOKIE}=${token}`, "content-type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) } as never);
  return { status: res.status, body: (await res.json()) as T & { error?: string; fields?: Record<string, string> } };
}

beforeAll(async () => {
  await prisma.taskTemplate.deleteMany();
  for (const t of ["a", "b"]) await prisma.team.create({ data: { id: id(`team-${t}`), name: `Team ${t}` } });
  const mk = (key: string, roles: string[], team: "a" | "b", extra: Record<string, unknown> = {}) =>
    prisma.user.create({ data: { id: id(key), upn: `${P}${key}@example.test`, displayName: key, roles, teamId: id(`team-${team}`), ...extra } });
  await mk("lmA", ["LM"], "a");
  await mk("lmB", ["LM"], "b");
  await mk("buddyA", ["BUDDY"], "a", { buddyEligible: true });
  await mk("ineligibleA", [], "a");
  await mk("buddyB", ["BUDDY"], "b", { buddyEligible: true });
  await mk("starterA", ["STARTER"], "a");
  await mk("starterB", ["STARTER"], "b");
  await mk("pnp", ["PNP"], "a");
  const base = { description: "", dependsOn: [], gating: false, dueOffsetDays: 0, source: "CORE", adapterKey: null };
  await prisma.taskTemplate.createMany({
    data: [
      { ...base, key: "intro", title: "Welcome", stage: "CONDITIONAL_OFFER", owner: "STARTER", type: "INFO", dueOffsetDays: -30 },
      { ...base, key: "forward-team-calls", title: "Forward team calls", stage: "CONDITIONAL_OFFER", owner: "LM", type: "CHECKLIST", dueOffsetDays: -20 },
    ],
  });
  const start = new Date("2026-12-14T00:00:00Z");
  jA = (await createJourneyForStarter({ starterId: id("starterA"), lmId: id("lmA"), teamId: id("team-a"), startDate: start })).id;
  jB = (await createJourneyForStarter({ starterId: id("starterB"), lmId: id("lmB"), teamId: id("team-b"), startDate: start })).id;
});

afterEach(() => {
  delete process.env.AUTH_MODE;
});

describe("scoping: an LM sees only their own starters", () => {
  it("lists only the caller's starters", async () => {
    const a = await call<StarterListResponse>("lmA", listGET);
    expect(a.status).toBe(200);
    expect(a.body.starters.map((s) => s.id)).toEqual([jA]);
    const b = await call<StarterListResponse>("lmB", listGET);
    expect(b.body.starters.map((s) => s.id)).toEqual([jB]);
  });

  it("returns 403 when LM A reads LM B's starter", async () => {
    expect((await call("lmA", detailGET, { params: { journeyId: jB } })).status).toBe(403);
    expect((await call("lmA", detailGET, { params: { journeyId: jA } })).status).toBe(200);
  });

  it("returns 403 for every write against another LM's starter, and changes nothing", async () => {
    const params = { journeyId: jB };
    const attempts = await Promise.all([
      call("lmA", buddyPOST, { method: "POST", params, body: { buddyId: id("buddyB") } }),
      call("lmA", taskPOST, { method: "POST", params, body: { title: "x", stage: "PEV", dueDate: "2026-12-01" } }),
      call("lmA", taskPATCH, { method: "PATCH", params: { ...params, key: "forward-team-calls" }, body: { status: "DONE" } }),
      call("lmA", day0PUT, { method: "PUT", params, body: { where: "HQ", who: "Sam", whenAt: "2026-12-14T09:00:00Z" } }),
      call("lmA", checkInPOST, { method: "POST", params, body: { cadence: "WEEKLY", scheduledAt: "2026-12-01T10:00:00Z" } }),
      call("lmA", goalPOST, { method: "POST", params, body: { horizon: "30", text: "x" } }),
    ]);
    expect(attempts.map((a) => a.status)).toEqual([403, 403, 403, 403, 403, 403]);
    const j = await loadJourney(jB);
    expect(j!.buddyId).toBeNull();
    expect(j!.tasks.some((t) => t.source === "BESPOKE")).toBe(false);
    expect(j!.tasks.find((t) => t.key === "forward-team-calls")!.status).not.toBe("DONE");
  });

  it("blocks goal edits that reach across journeys", async () => {
    const g = await prisma.goal.create({ data: { journeyId: jB, horizon: "30", text: "B goal" } });
    const r = await call("lmA", goalPATCH, { method: "PATCH", params: { journeyId: jA, goalId: g.id }, body: { done: true } });
    expect(r.status).toBe(404);
    expect((await prisma.goal.findUnique({ where: { id: g.id } }))!.done).toBe(false);
  });

  it("rejects unauthenticated and non-LM callers", async () => {
    delete process.env.AUTH_MODE;
    process.env.AUTH_MODE = "demo";
    const res = await listGET(new Request("http://localhost/api/lm/starters"), undefined);
    expect(res.status).toBe(401);
    expect((await call("starterA", listGET)).status).toBe(403);
    expect((await call("buddyA", detailGET, { params: { journeyId: jA } })).status).toBe(403);
  });

  it("lets P&P read any starter (shared access rules)", async () => {
    expect((await call("pnp", detailGET, { params: { journeyId: jB } })).status).toBe(200);
  });
});

describe("buddy allocation (FR-1.3)", () => {
  const params = () => ({ journeyId: jA });
  const allocate = (buddy: string) => call("lmA", buddyPOST, { method: "POST", params: params(), body: { buddyId: id(buddy) } });

  it("offers only eligible members of the starter's team, never the LM", async () => {
    const d = await call<StarterDetail>("lmA", detailGET, { params: params() });
    expect(d.body.buddyCandidates.map((c) => c.id)).toEqual([id("buddyA")]);
  });

  it("rejects the LM themself", async () => {
    const r = await allocate("lmA");
    expect(r.status).toBe(400);
    expect(r.body.fields?.buddyId).toBeTruthy();
  });

  it("rejects the starter, an ineligible user and someone from another team", async () => {
    expect((await allocate("starterA")).status).toBe(400);
    expect((await allocate("ineligibleA")).status).toBe(400);
    expect((await allocate("buddyB")).status).toBe(400);
    expect((await loadJourney(jA))!.buddyId).toBeNull();
  });

  it("allocates an eligible team member and records an audit event", async () => {
    const r = await allocate("buddyA");
    expect(r.status).toBe(200);
    expect((r.body as unknown as StarterDetail).buddy?.id).toBe(id("buddyA"));
    expect((await loadJourney(jA))!.buddyId).toBe(id("buddyA"));
    expect((await listEvents(jA)).map((e) => e.type)).toContain("BUDDY_ALLOCATED");
  });
});

describe("bespoke tasks (FR-3.6)", () => {
  it("appears in the journey tasks immediately", async () => {
    const r = await call<StarterDetail>("lmA", taskPOST, {
      method: "POST",
      params: { journeyId: jA },
      body: { title: "Pick up lanyard", description: "From reception", stage: "DAY_0", dueDate: "2026-12-14" },
    });
    expect(r.status).toBe(201);
    const t = r.body.tasks.find((x) => x.title === "Pick up lanyard");
    expect(t).toMatchObject({ source: "BESPOKE", stage: "DAY_0", owner: "STARTER" });
    expect((await loadJourney(jA))!.tasks.some((x) => x.title === "Pick up lanyard")).toBe(true);
    expect((await listEvents(jA)).map((e) => e.type)).toContain("TASK_ADDED");
  });

  it("validates input with field errors", async () => {
    const r = await call("lmA", taskPOST, { method: "POST", params: { journeyId: jA }, body: { title: "  ", stage: "NOPE", dueDate: "" } });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.fields ?? {})).toEqual(expect.arrayContaining(["title", "stage", "dueDate"]));
  });
});

describe("LM-owned tasks and team call links (FR-3.13)", () => {
  const key = "forward-team-calls";
  const params = () => ({ journeyId: jA, key });

  it("refuses to change tasks the starter owns", async () => {
    const r = await call("lmA", taskPATCH, { method: "PATCH", params: { journeyId: jA, key: "intro" }, body: { status: "DONE" } });
    expect(r.status).toBe(403);
  });

  it("saves Teams links as references without completing, then completes", async () => {
    const link = "https://teams.microsoft.com/l/meetup-join/abc";
    const saved = await call<StarterDetail>("lmA", taskPATCH, { method: "PATCH", params: params(), body: { links: [link] } });
    expect(saved.status).toBe(200);
    expect(saved.body.tasks.find((t) => t.key === key)!.evidence).toBe(link);
    const done = await call<StarterDetail>("lmA", taskPATCH, { method: "PATCH", params: params(), body: { status: "DONE" } });
    const t = done.body.tasks.find((x) => x.key === key)!;
    expect(t.status).toBe("DONE");
    expect(t.evidence).toBe(link);
  });

  it("rejects non-https links", async () => {
    const r = await call("lmA", taskPATCH, { method: "PATCH", params: params(), body: { links: ["javascript:alert(1)"] } });
    expect(r.status).toBe(400);
  });
});

describe("photo recertification (D12)", () => {
  it("shows issues, requires a justification, is LM-scoped, and completes the task with audit data", async () => {
    const base = { description: "", dependsOn: [], gating: false, dueOffsetDays: 0, source: "CORE", adapterKey: null };
    const tpl = await prisma.taskTemplate.create({ data: { ...base, key: "photo-check-override", title: "Photo override", stage: "UNCONDITIONAL_OFFER", owner: "PNP", type: "ACTION", dueOffsetDays: -3 } });
    const start = new Date("2026-12-20T00:00:00Z");
    const [a, b] = await Promise.all(["photoA", "photoB"].map(async (n) => {
      await prisma.user.create({ data: { id: id(n), upn: `${P}${n}@example.test`, displayName: n, roles: ["STARTER"], teamId: id("team-a") } });
      return createJourneyForStarter({ starterId: id(n), lmId: id("lmA"), teamId: id("team-a"), startDate: start });
    }));
    await prisma.taskTemplate.delete({ where: { id: tpl.id } });
    await prisma.integrationState.create({ data: { journeyId: a.id, adapterKey: "photocheck", status: "failed", payload: { issues: ["Sunglasses detected"] } } });
    const d = await call<StarterDetail>("lmA", detailGET, { params: { journeyId: a.id } });
    expect(d.body.photoReview).toEqual({ taskKey: "photo-check-override", issues: ["Sunglasses detected"] });

    const post = (as: string, journeyId: string, body: unknown) => call<StarterDetail>(as, photoPOST, { method: "POST", params: { journeyId }, body });
    expect((await post("lmB", a.id, { justification: "Looks fine to me" })).status).toBe(403);
    expect((await post("lmA", a.id, { justification: "" })).status).toBe(400);
    const ok = await post("lmA", a.id, { justification: "Glasses are clear prescription" });
    expect(ok.status).toBe(200);
    expect(ok.body.photoReview).toBeNull();
    const ev = (await listEvents(a.id)).find((e) => e.type === "PHOTO_OVERRIDE");
    expect(ev?.data).toMatchObject({ justification: "Glasses are clear prescription", by: "LM" });
    expect((await post("lmA", a.id, { justification: "Again please" })).status).toBe(409);
    expect(b.id).toBeTruthy();
  });
});

describe("check-ins, Day 0 and goals", () => {
  it("stores a check-in with a generated Teams meeting link", async () => {
    const r = await call<StarterDetail>("lmA", checkInPOST, {
      method: "POST",
      params: { journeyId: jA },
      body: { cadence: "WEEKLY", scheduledAt: "2026-12-01T10:00:00.000Z" },
    });
    expect(r.status).toBe(200);
    expect(r.body.checkIns[0].cadence).toBe("WEEKLY");
    expect(r.body.checkIns[0].meetingLink).toContain("https://teams.microsoft.com/l/meeting/new");
    expect(r.body.checkIns[0].meetingLink).toContain(encodeURIComponent(`${P}starterA@example.test`));
    expect((await call("lmA", checkInPOST, { method: "POST", params: { journeyId: jA }, body: { cadence: "DAILY", scheduledAt: "x" } })).status).toBe(400);
  });

  it("proposes Day 0 unconfirmed, and re-proposing resets confirmation", async () => {
    const body = { where: "Reception, 3rd floor", who: "Dana", whenAt: "2026-12-14T09:30:00.000Z" };
    const r = await call<StarterDetail>("lmA", day0PUT, { method: "PUT", params: { journeyId: jA }, body });
    expect(r.body.day0).toMatchObject({ where: body.where, who: "Dana", confirmedAt: null });
    await prisma.day0Arrangement.update({ where: { journeyId: jA }, data: { confirmedAt: new Date() } });
    const again = await call<StarterDetail>("lmA", day0PUT, { method: "PUT", params: { journeyId: jA }, body: { ...body, where: "Atrium" } });
    expect(again.body.day0).toMatchObject({ where: "Atrium", confirmedAt: null });
  });

  it("adds and edits goals including CASCADED", async () => {
    const add = await call<StarterDetail>("lmA", goalPOST, { method: "POST", params: { journeyId: jA }, body: { horizon: "CASCADED", text: "Ship the onboarding pilot" } });
    expect(add.status).toBe(201);
    const goal = add.body.goals.find((g) => g.horizon === "CASCADED")!;
    const upd = await call<StarterDetail>("lmA", goalPATCH, { method: "PATCH", params: { journeyId: jA, goalId: goal.id }, body: { text: "Ship the pilot", done: true } });
    expect(upd.body.goals.find((g) => g.id === goal.id)).toMatchObject({ text: "Ship the pilot", done: true });
    expect((await call("lmA", goalPOST, { method: "POST", params: { journeyId: jA }, body: { horizon: "7", text: "" } })).status).toBe(400);
  });
});

describe("team checklist items (F11)", () => {
  it("has no TEAM tasks until the LM adds one, then creates a TEAM task owned by the LM", async () => {
    const before = await call<StarterDetail>("lmA", detailGET, { params: { journeyId: jA } });
    expect(before.body.tasks.some((t) => t.source === "TEAM")).toBe(false);
    const r = await call<StarterDetail>("lmA", teamItemPOST, {
      method: "POST",
      params: { journeyId: jA },
      body: { title: "Add to team rota", description: "", dueDate: "2026-12-10", owner: "LM" },
    });
    expect(r.status).toBe(201);
    expect(r.body.tasks.find((t) => t.title === "Add to team rota")).toMatchObject({ source: "TEAM", owner: "LM", type: "CHECKLIST" });
  });

  it("can be owned by the starter, validates input and is LM-scoped", async () => {
    const post = (as: string, body: unknown) => call<StarterDetail>(as, teamItemPOST, { method: "POST", params: { journeyId: jA }, body });
    const r = await post("lmA", { title: "Read the team charter", dueDate: "2026-12-11", owner: "STARTER" });
    expect(r.body.tasks.find((t) => t.title === "Read the team charter")).toMatchObject({ source: "TEAM", owner: "STARTER", canAct: false });
    const bad = await post("lmA", { title: " ", dueDate: "", owner: "BUDDY" });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.fields ?? {})).toEqual(expect.arrayContaining(["title", "dueDate", "owner"]));
    expect((await post("lmB", { title: "Nope", dueDate: "2026-12-11", owner: "LM" })).status).toBe(403);
  });
});

describe("past starters and the switcher list (F15)", () => {
  let past = "";
  beforeAll(async () => {
    await prisma.user.create({ data: { id: id("starterPast"), upn: `${P}starterPast@example.test`, displayName: "starterPast", roles: ["STARTER"], teamId: id("team-a") } });
    past = (await createJourneyForStarter({ starterId: id("starterPast"), lmId: id("lmA"), teamId: id("team-a"), startDate: new Date("2026-12-21T00:00:00Z") })).id;
    await exitJourney(past, "NO_SHOW");
  });

  it("lists exited journeys separately and only for the owning LM", async () => {
    const a = await call<StarterListResponse>("lmA", listGET);
    expect(a.body.past.map((s) => s.id)).toEqual([past]);
    expect(a.body.starters.map((s) => s.id)).not.toContain(past);
    expect(a.body.starters.every((s) => s.status === "active")).toBe(true);
    const b = await call<StarterListResponse>("lmB", listGET);
    expect(b.body.past).toEqual([]);
    expect(b.body.starters.map((s) => s.id)).toEqual([jB]);
  });

  it("opens a past journey read-only and rejects every write with a clear message", async () => {
    const d = await call<StarterDetail>("lmA", detailGET, { params: { journeyId: past } });
    expect(d.status).toBe(200);
    expect(d.body.tasks.every((t) => !t.canAct)).toBe(true);
    const params = { journeyId: past };
    const writes = await Promise.all([
      call<{ message: string }>("lmA", taskPOST, { method: "POST", params, body: { title: "x", stage: "DAY_0", dueDate: "2026-12-30" } }),
      call<{ message: string }>("lmA", teamItemPOST, { method: "POST", params, body: { title: "x", dueDate: "2026-12-30", owner: "LM" } }),
      call<{ message: string }>("lmA", day0PUT, { method: "PUT", params, body: { where: "a", who: "b", whenAt: "2026-12-21T09:00:00.000Z" } }),
      call<{ message: string }>("lmA", goalPOST, { method: "POST", params, body: { horizon: "30", text: "x" } }),
      call<{ message: string }>("lmA", taskPATCH, { method: "PATCH", params: { ...params, key: "forward-team-calls" }, body: { status: "DONE" } }),
    ]);
    expect(writes.map((w) => w.status)).toEqual([409, 409, 409, 409, 409]);
    expect(writes[0].body.message).toMatch(/read-only/);
    expect(await prisma.day0Arrangement.findUnique({ where: { journeyId: past } })).toBeNull();
    expect((await loadJourney(past))!.status).toBe("exited");
  });
});

describe("Day 0 LM state (F13)", () => {
  it("is null before the LM sets it up, waiting after proposing, confirmed once the starter confirms", async () => {
    const fresh = await call<StarterDetail>("lmA", detailGET, { params: { journeyId: jA } });
    const had = fresh.body.day0;
    if (had) await prisma.day0Arrangement.delete({ where: { journeyId: jA } });
    expect((await call<StarterDetail>("lmA", detailGET, { params: { journeyId: jA } })).body.day0).toBeNull();
    const body = { where: "Reception", who: "Dana at the desk", whenAt: "2026-12-14T09:30:00.000Z" };
    const waiting = await call<StarterDetail>("lmA", day0PUT, { method: "PUT", params: { journeyId: jA }, body });
    expect(waiting.body.day0).toMatchObject({ ...body, confirmedAt: null });
    await prisma.day0Arrangement.update({ where: { journeyId: jA }, data: { confirmedAt: new Date() } });
    const confirmed = await call<StarterDetail>("lmA", detailGET, { params: { journeyId: jA } });
    expect(confirmed.body.day0?.confirmedAt).toBeTruthy();
  });
});
