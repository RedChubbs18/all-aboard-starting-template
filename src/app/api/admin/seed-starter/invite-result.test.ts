import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { DEMO_COOKIE, signDemoSession } from "@/lib/auth/server";
import { createJourneyForStarter } from "@/server/journey-service";
import { TEMPLATES } from "@/domain/test-fixtures";
import { POST } from "./[journeyId]/invite-result/route";
import { POST as postSeed } from "./route";

const P = "ir-";
const ids = { admin: `${P}admin`, lm: `${P}lm`, starter: `${P}starter`, team: `${P}team` };
const GUID = "11111111-2222-3333-4444-555555555555";
const PERSONAL = "pat.sample@personal.example";
let journeyId: string;

beforeAll(async () => {
  process.env.AUTH_MODE = "demo";
  await prisma.team.create({ data: { id: ids.team, name: "Invite Result Team", area: "Testing" } });
  const mk = (id: string, roles: string[]) => prisma.user.create({ data: { id, upn: `${id}@example.test`, displayName: id, roles, teamId: ids.team } });
  await mk(ids.admin, ["ADMIN"]);
  await mk(ids.lm, ["LM"]);
  await mk(ids.starter, ["STARTER"]);
  for (const t of TEMPLATES.filter((t) => t.source === "CORE")) {
    await prisma.taskTemplate.upsert({
      where: { key: `${P}${t.key}` },
      update: {},
      create: { ...t, key: `${P}${t.key}`, dependsOn: t.dependsOn.map((d) => `${P}${d}`), condition: t.condition ? t.condition.replace(":", `:${P}`) : null, adapterKey: t.adapterKey ?? null },
    });
  }
  journeyId = (await createJourneyForStarter({ starterId: ids.starter, lmId: ids.lm, buddyId: null, teamId: ids.team, startDate: new Date("2030-01-01T00:00:00.000Z"), actorId: ids.admin })).id;
});
afterAll(() => {
  delete process.env.AUTH_MODE;
});

async function call(userId: string, body: unknown, jid = journeyId) {
  const token = await signDemoSession(userId);
  return POST(
    new Request(`http://localhost/api/admin/seed-starter/${jid}/invite-result`, {
      method: "POST",
      headers: { cookie: `${DEMO_COOKIE}=${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ journeyId: jid }) },
  );
}
const state = () => prisma.integrationState.findUnique({ where: { journeyId_adapterKey: { journeyId, adapterKey: "identity" } } });
const dump = async () => JSON.stringify([await state(), await prisma.event.findMany({ where: { journeyId } })]);

describe("POST /api/admin/seed-starter/[journeyId]/invite-result", () => {
  it("is ADMIN only", async () => {
    for (const u of [ids.lm, ids.starter]) expect((await call(u, { status: "invited", guestObjectId: GUID })).status).toBe(403);
    expect(await state()).toBeNull();
  });

  it("404s for an unknown journey", async () => {
    expect((await call(ids.admin, { status: "invited", guestObjectId: GUID }, "nope")).status).toBe(404);
  });

  it("rejects anything but status and guest object id, so an email cannot be persisted", async () => {
    expect((await call(ids.admin, { status: "invited", guestObjectId: GUID, personalEmail: PERSONAL })).status).toBe(400);
    expect((await call(ids.admin, { status: "invited", guestObjectId: PERSONAL })).status).toBe(400);
    expect((await call(ids.admin, { status: "invited" })).status).toBe(400);
    expect((await call(ids.admin, { status: "fallback", reason: PERSONAL })).status).toBe(400);
    expect(await state()).toBeNull();
  });

  it("records the guest object id and status, writes an audit Event, stores no email", async () => {
    const res = await call(ids.admin, { status: "invited", guestObjectId: GUID });
    expect(res.status).toBe(200);
    const s = await state();
    expect(s!.status).toBe("invited");
    expect(s!.payload).toMatchObject({ guestObjectId: GUID });
    const ev = await prisma.event.findFirst({ where: { journeyId, type: "INTEGRATION_STATUS", entityId: "identity" } });
    expect(ev!.actorId).toBe(ids.admin);
    expect(ev!.data).toMatchObject({ via: "graph", guestObjectId: GUID });
    expect(await dump()).not.toContain("personal.example");
  });

  it("accepts only one report per journey", async () => {
    expect((await call(ids.admin, { status: "invited", guestObjectId: GUID })).status).toBe(409);
  });
});

describe("seed-starter deferInvite", () => {
  it("is ignored outside entra mode with the flag on, so the mock invite still runs", async () => {
    const token = await signDemoSession(ids.admin);
    const res = await postSeed(
      new Request("http://localhost/api/admin/seed-starter", {
        method: "POST",
        headers: { cookie: `${DEMO_COOKIE}=${token}`, "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Defer Test", upn: "ir-defer@example.test", teamId: ids.team, lmId: ids.lm, startDate: "2030-01-01", deferInvite: true }),
      }),
      undefined,
    );
    expect(res.status).toBe(201);
    expect((await res.json()).identity).toEqual({ ok: true, status: "invited" });
  });
});

describe("fallback report", () => {
  it("uses the mock invite and audits the reason", async () => {
    const other = await prisma.user.create({ data: { id: `${P}starter2`, upn: `${P}starter2@example.test`, displayName: "s2", roles: ["STARTER"], teamId: ids.team } });
    const j = await createJourneyForStarter({ starterId: other.id, lmId: ids.lm, buddyId: null, teamId: ids.team, startDate: new Date("2030-01-01T00:00:00.000Z"), actorId: ids.admin });
    const res = await call(ids.admin, { status: "fallback", reason: "consent_required" }, j.id);
    expect(res.status).toBe(200);
    expect((await prisma.integrationState.findUnique({ where: { journeyId_adapterKey: { journeyId: j.id, adapterKey: "identity" } } }))!.status).toBe("invited");
    const ev = await prisma.event.findFirst({ where: { journeyId: j.id, type: "INTEGRATION_STATUS", entityId: "identity" } });
    expect(ev!.data).toMatchObject({ via: "mock_fallback", reason: "consent_required" });
  });
});
