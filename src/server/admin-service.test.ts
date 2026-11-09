import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./db";
import * as admin from "./admin-service";
import { signDemoSession, DEMO_COOKIE } from "@/lib/auth/server";
import { TEMPLATES } from "@/domain/test-fixtures";
import { POST as postTemplate, GET as getTemplates } from "@/app/api/admin/templates/route";
import { PUT as putUser } from "@/app/api/admin/users/[id]/route";
import { POST as postSeed } from "@/app/api/admin/seed-starter/route";

const P = "adm-";
const ids = { admin: `${P}admin`, lm: `${P}lm`, pnp: `${P}pnp`, starter: `${P}starter`, buddy: `${P}buddy`, team: `${P}team` };

beforeAll(async () => {
  process.env.AUTH_MODE = "demo";
  await prisma.taskTemplate.deleteMany();
  await prisma.team.create({ data: { id: ids.team, name: "Admin Test Team", area: "Testing" } });
  const mk = (id: string, roles: string[], extra = {}) =>
    prisma.user.create({ data: { id, upn: `${id}@example.test`, displayName: id, roles, teamId: ids.team, ...extra } });
  await mk(ids.admin, ["ADMIN"]);
  await mk(ids.lm, ["LM"]);
  await mk(ids.pnp, ["PNP"]);
  await mk(ids.starter, ["STARTER"]);
  await mk(ids.buddy, ["BUDDY"], { buddyEligible: true });
  for (const t of TEMPLATES.filter((t) => t.source === "CORE")) {
    await prisma.taskTemplate.create({ data: { ...t, key: `${P}${t.key}`, dependsOn: t.dependsOn.map((d) => `${P}${d}`), condition: t.condition ? t.condition.replace(":", `:${P}`) : null, adapterKey: t.adapterKey ?? null } });
  }
});
afterAll(() => {
  delete process.env.AUTH_MODE;
});

async function req(userId: string, body?: unknown, method = "POST") {
  const token = await signDemoSession(userId);
  return new Request("http://localhost/api/admin/x", {
    method,
    headers: { cookie: `${DEMO_COOKIE}=${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const newTemplate = { key: `${P}extra`, title: "Extra", stage: "PEV", owner: "STARTER", type: "ACTION", dueOffsetDays: -2 };

describe("role guard", () => {
  it("rejects non-admin writes with 403 and writes nothing", async () => {
    for (const u of [ids.lm, ids.pnp, ids.starter, ids.buddy]) {
      expect((await postTemplate(await req(u, newTemplate), undefined)).status).toBe(403);
      expect((await postSeed(await req(u, {}), undefined)).status).toBe(403);
      expect((await putUser(await req(u, { roles: ["ADMIN"], buddyEligible: false }, "PUT"), { params: Promise.resolve({ id: u }) })).status).toBe(403);
    }
    expect(await prisma.taskTemplate.count({ where: { key: newTemplate.key } })).toBe(0);
  });
  it("lets P&P read templates but not other roles", async () => {
    expect((await getTemplates(await req(ids.pnp, undefined, "GET"), undefined)).status).toBe(200);
    expect((await getTemplates(await req(ids.lm, undefined, "GET"), undefined)).status).toBe(403);
  });
  it("rejects unauthenticated calls", async () => {
    const r = await postTemplate(new Request("http://localhost/x", { method: "POST" }), undefined);
    expect(r.status).toBe(401);
  });
  it("lets an admin create a template and audits it", async () => {
    const r = await postTemplate(await req(ids.admin, newTemplate), undefined);
    expect(r.status).toBe(201);
    const ev = await prisma.event.findFirst({ where: { type: "ADMIN_TEMPLATE_CREATED", actorId: ids.admin } });
    expect(ev).toBeTruthy();
  });
  it("returns field errors for a cycle", async () => {
    const r = await postTemplate(await req(ids.admin, { ...newTemplate, key: `${P}cyc`, dependsOn: [`${P}extra`] }), undefined);
    expect(r.status).toBe(201);
    const extra = await prisma.taskTemplate.findUniqueOrThrow({ where: { key: `${P}extra` } });
    await expect(admin.updateTemplate(ids.admin, extra.id, { ...newTemplate, dependsOn: [`${P}cyc`] })).rejects.toMatchObject({ status: 400, fields: { dependsOn: expect.stringMatching(/cycle/i) } });
  });
});

describe("users", () => {
  it("prevents an admin removing their own ADMIN role", async () => {
    await expect(admin.updateUser(ids.admin, ids.admin, { roles: ["LM"], buddyEligible: false })).rejects.toMatchObject({ fields: { roles: expect.any(String) } });
    expect(await admin.updateUser(ids.admin, ids.admin, { roles: ["ADMIN", "LM"], buddyEligible: false })).toEqual({ id: ids.admin });
  });
});

describe("seedNewStarter", () => {
  it("creates a user, journey with tasks, an invite and audit events", async () => {
    const r = await admin.seedNewStarter(ids.admin, {
      displayName: "Seed Person",
      upn: "seed.person@example.test",
      teamId: ids.team,
      lmId: ids.lm,
      buddyId: ids.buddy,
      startDate: "2026-12-07",
    });
    expect(r.taskCount).toBeGreaterThan(5);
    expect(r.identity).toMatchObject({ ok: true, status: "invited" });
    expect(r.links.lm).toContain(r.journeyId);
    const journey = await prisma.journey.findUniqueOrThrow({ where: { id: r.journeyId }, include: { tasks: true } });
    expect(journey.tasks.length).toBe(r.taskCount);
    expect(journey.buddyId).toBe(ids.buddy);
    const types = (await prisma.event.findMany({ where: { journeyId: r.journeyId } })).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["JOURNEY_CREATED", "ADMIN_STARTER_SEEDED", "INTEGRATION_STATUS"]));
    const user = await prisma.user.findUniqueOrThrow({ where: { id: r.starterId } });
    expect(user.roles).toEqual(["STARTER"]);
    const state = await prisma.integrationState.findUnique({ where: { journeyId_adapterKey: { journeyId: r.journeyId, adapterKey: "identity" } } });
    expect(state?.status).toBe("invited");
  });
  it("records an exit with reasonSource PNP, once only", async () => {
    const r = await admin.seedNewStarter(ids.admin, { displayName: "Exit Person", upn: "exit.person@example.test", teamId: ids.team, lmId: ids.lm, startDate: "2026-12-07" });
    await admin.recordExit(ids.pnp, r.journeyId, { reason: "NO_SHOW", note: "Did not arrive" });
    const j = await prisma.journey.findUniqueOrThrow({ where: { id: r.journeyId } });
    expect(j.status).toBe("exited");
    expect(j.exitReason).toBe("NO_SHOW");
    const ev = await prisma.event.findFirstOrThrow({ where: { journeyId: r.journeyId, type: "JOURNEY_EXITED" } });
    expect(ev.data).toMatchObject({ reasonSource: "PNP", reason: "NO_SHOW" });
    await expect(admin.recordExit(ids.pnp, r.journeyId, { reason: "NO_SHOW" })).rejects.toMatchObject({ status: 409 });
    await expect(admin.recordExit(ids.pnp, r.journeyId, { reason: "BOGUS" })).rejects.toMatchObject({ status: 400 });
  });
  it("rejects a second journey for the same starter, bad LM and non-example emails", async () => {
    const ok = { teamId: ids.team, lmId: ids.lm, startDate: "2026-12-07" };
    await expect(admin.seedNewStarter(ids.admin, { ...ok, existingUserId: ids.starter, lmId: ids.pnp })).rejects.toMatchObject({ fields: { lmId: expect.any(String) } });
    await expect(admin.seedNewStarter(ids.admin, { ...ok, displayName: "X", upn: "x@gmail.com" })).rejects.toMatchObject({ status: 400 });
    await admin.seedNewStarter(ids.admin, { ...ok, existingUserId: ids.starter });
    await expect(admin.seedNewStarter(ids.admin, { ...ok, existingUserId: ids.starter })).rejects.toMatchObject({ fields: { existingUserId: expect.any(String) } });
  });
});
