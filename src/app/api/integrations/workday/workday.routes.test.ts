/** Mock Workday integration (D24): signed webhook + directory, and the guest-sign-in auto-complete. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { seedDatabase } from "@/server/seed";
import { resetWorkdayRateLimit, signWorkday } from "@/server/workday-service";
import { completeGuestSignIn } from "@/server/guest-sign-in";
import { POST as offerAccepted } from "./offer-accepted/route";
import { GET as directory } from "./directory/route";

const SECRET = "a".repeat(40);
const GUEST_OID = "8d5f1c1e-5b0a-4c53-9a53-0b6a4f3c2d11";

const offer = (over: Record<string, unknown> = {}) => ({
  offerId: "wd-offer-1",
  candidate: { firstName: "Jo", lastName: "Bloggs" },
  jobTitle: "Software Engineer",
  teamKey: "dwe",
  lineManagerKey: "dana-sample",
  startDate: "2027-01-11",
  conditions: ["Satisfactory pre-employment vetting", "References"],
  guest: { objectId: GUEST_OID, inviteStatus: "invited" },
  ...over,
});

function post(body: unknown, o: { ts?: number; secret?: string; sig?: string; raw?: string; type?: string | null } = {}) {
  const raw = o.raw ?? JSON.stringify(body);
  const ts = String(o.ts ?? Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = { "x-workday-timestamp": ts, "x-workday-signature": o.sig ?? signWorkday(o.secret ?? SECRET, ts, raw) };
  if (o.type !== null) headers["content-type"] = o.type ?? "application/json";
  return offerAccepted(new Request("http://localhost/api/integrations/workday/offer-accepted", { method: "POST", headers, body: raw }));
}

beforeAll(() => {
  process.env.WORKDAY_WEBHOOK_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.WORKDAY_WEBHOOK_SECRET;
});
beforeEach(async () => {
  process.env.WORKDAY_WEBHOOK_SECRET = SECRET;
  resetWorkdayRateLimit();
  await seedDatabase(prisma);
});

describe("signature and enablement", () => {
  it("accepts a valid signature", async () => {
    expect((await post(offer())).status).toBe(200);
  });
  it("rejects a wrong signature, wrong secret and tampered body with 401", async () => {
    expect((await post(offer(), { sig: "sha256=" + "0".repeat(64) })).status).toBe(401);
    expect((await post(offer(), { secret: "b".repeat(40) })).status).toBe(401);
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = signWorkday(SECRET, ts, JSON.stringify(offer()));
    expect((await post(offer({ jobTitle: "Other" }), { ts: Number(ts), sig })).status).toBe(401);
  });
  it("rejects a stale or future timestamp with 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect((await post(offer(), { ts: now - 301 })).status).toBe(401);
    expect((await post(offer(), { ts: now + 301 })).status).toBe(401);
  });
  it("is disabled (404) without a usable secret", async () => {
    for (const s of ["", "short", "change-me-".padEnd(40, "x")]) {
      process.env.WORKDAY_WEBHOOK_SECRET = s;
      expect((await post(offer(), { secret: s || "x" })).status).toBe(404);
      const ts = String(Math.floor(Date.now() / 1000));
      const res = await directory(new Request("http://localhost/api/integrations/workday/directory", { headers: { "x-workday-timestamp": ts, "x-workday-signature": signWorkday(SECRET, ts, "") } }));
      expect(res.status).toBe(404);
    }
  });
  it("needs a JSON content type", async () => {
    expect((await post(offer(), { type: "text/plain" })).status).toBe(415);
    expect((await post(offer(), { type: null })).status).toBe(415);
  });
  it("rate limits", async () => {
    let last = 200;
    for (let i = 0; i < 61; i++) last = (await post(offer(), { sig: "sha256=bad" })).status;
    expect(last).toBe(429);
  });
});

describe("validation", () => {
  it("rejects an email-looking value anywhere (PII rule)", async () => {
    expect((await post(offer({ jobTitle: "jo@example.com" }))).status).toBe(400);
    expect((await post(offer({ conditions: ["send to jo@example.com"] }))).status).toBe(400);
    expect((await post(offer({ candidate: { firstName: "Jo", lastName: "Bloggs", email: "jo@example.com" } }))).status).toBe(400);
    expect((await post(offer({ email: "x" }))).status).toBe(400);
  });
  it("rejects extra keys, bad dates, bad JSON", async () => {
    expect((await post(offer({ extra: 1 }))).status).toBe(400);
    expect((await post(offer({ startDate: "11/01/2027" }))).status).toBe(400);
    expect((await post(offer({ guest: { objectId: null, inviteStatus: "sent" } }))).status).toBe(400);
    expect((await post(null, { raw: "{nope" })).status).toBe(400);
  });
  it("returns 409 for an unknown team or line manager", async () => {
    expect((await post(offer({ teamKey: "nope" }))).status).toBe(409);
    expect((await post(offer({ lineManagerKey: "nobody" }))).status).toBe(409);
    expect((await post(offer({ lineManagerKey: "owen-placeholder" }))).status).toBe(409); // an LM, but of another team
    expect((await post(offer({ lineManagerKey: "kai-demo" }))).status).toBe(409); // not an LM
  });
});

describe("offer accepted", () => {
  it("creates the starter, journey, completed guest-invite-sent task and audit events", async () => {
    const res = await post(offer());
    const { journeyId, starterId } = await res.json();
    const starter = await prisma.user.findUniqueOrThrow({ where: { id: starterId } });
    expect(starter).toMatchObject({ entraOid: GUEST_OID, displayName: "Jo Bloggs", teamId: "dwe", reportsToId: "dana-sample", upn: "guest-wd-offer-1@myjourney.invalid" });
    expect(starter.roles).toEqual(["STARTER"]);
    const j = await prisma.journey.findUniqueOrThrow({ where: { id: journeyId }, include: { tasks: true } });
    expect(j).toMatchObject({ starterId, lmId: "dana-sample", teamId: "dwe", currentStage: "CONDITIONAL_OFFER" });
    expect(j.startDate.toISOString()).toBe("2027-01-11T00:00:00.000Z");
    expect(j.tasks.find((t) => t.key === "guest-invite-sent")).toMatchObject({ status: "DONE", evidence: "invited" });
    expect(j.tasks.find((t) => t.key === "guest-sign-in")!.status).not.toBe("DONE");
    const state = await prisma.integrationState.findFirstOrThrow({ where: { journeyId, adapterKey: "workday-offer" } });
    expect(state.payload).toMatchObject({ offerId: "wd-offer-1", conditions: ["Satisfactory pre-employment vetting", "References"] });
    const events = await prisma.event.findMany({ where: { journeyId } });
    expect(events.some((e) => e.type === "WORKDAY_OFFER_ACCEPTED")).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/@/);
  });

  it("is idempotent on offerId", async () => {
    const a = await (await post(offer())).json();
    const b = await (await post(offer())).json();
    expect(b).toEqual(a);
    expect(await prisma.journey.count({ where: { starterId: a.starterId } })).toBe(1);
    expect(await prisma.event.count({ where: { type: "WORKDAY_OFFER_ACCEPTED" } })).toBe(1);
  });

  it("reuses an existing user with the same entraOid", async () => {
    await prisma.user.create({ data: { id: "existing-guest", upn: "existing@example.test", displayName: "Existing", roles: ["STARTER"], entraOid: GUEST_OID } });
    const r = await (await post(offer())).json();
    expect(r.starterId).toBe("existing-guest");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: "existing-guest" } })).teamId).toBeNull(); // left as is
  });

  it("works without a guest object id and leaves guest-invite-sent open when the invite failed", async () => {
    const r = await (await post(offer({ offerId: "wd-offer-2", guest: { objectId: null, inviteStatus: "failed" } }))).json();
    const tasks = await prisma.task.findMany({ where: { journeyId: r.journeyId } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: r.starterId } })).entraOid).toBeNull();
    expect(tasks.find((t) => t.key === "guest-invite-sent")!.status).not.toBe("DONE");
  });
});

describe("directory", () => {
  it("returns teams with business area and line managers, keys and names only", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await directory(new Request("http://localhost/api/integrations/workday/directory", { headers: { "x-workday-timestamp": ts, "x-workday-signature": signWorkday(SECRET, ts, "") } }));
    expect(res.status).toBe(200);
    const { teams } = await res.json();
    expect(teams.find((t: { key: string }) => t.key === "dwe")).toEqual({ key: "dwe", name: "Digital Workplace Engineering", businessArea: "Digital Workplace", lineManagers: [{ key: "dana-sample", name: "Dana Sample" }] });
    expect(JSON.stringify(teams)).not.toMatch(/@/);
  });
  it("401 without a valid signature", async () => {
    const res = await directory(new Request("http://localhost/api/integrations/workday/directory"));
    expect(res.status).toBe(401);
  });
});

describe("guest sign-in auto-complete", () => {
  it("completes guest-sign-in once, with an audit event", async () => {
    const { journeyId, starterId } = await (await post(offer())).json();
    expect(await completeGuestSignIn(starterId)).toBe(true);
    expect(await prisma.task.findFirstOrThrow({ where: { journeyId, key: "guest-sign-in" } })).toMatchObject({ status: "DONE", evidence: "entra-sign-in" });
    expect(await completeGuestSignIn(starterId)).toBe(false);
    expect(await prisma.event.count({ where: { journeyId, type: "GUEST_SIGNED_IN" } })).toBe(1);
  });
  it("does nothing for users without a journey", async () => {
    expect(await completeGuestSignIn("dana-sample")).toBe(false);
  });
});
