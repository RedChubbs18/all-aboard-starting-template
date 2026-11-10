import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// msal-node is mocked: no network, no real token.
vi.mock("@azure/msal-node", () => ({
  ConfidentialClientApplication: class {
    async acquireTokenByClientCredential() {
      return { accessToken: "test-app-token", expiresOn: new Date(Date.now() + 3_600_000) };
    }
  },
}));

import { prisma } from "./db";
import { seedDatabase } from "./seed";
import * as js from "./journey-service";
import { simulate, runDemoStep } from "./integration-service";
import { candidateUpn, convertStarterToMember, generateTempPassword, getWorkAccountStatus, memberLocalPart } from "./identity-conversion";
import { graphConfig, resetGraphTokenCache, type GraphConfig } from "./graph-app";
import { signDemoSession, DEMO_COOKIE } from "@/lib/auth/server";
import { POST as convertPost } from "@/app/api/admin/journeys/[id]/convert/route";

const ALEX = "journey-alex-morgan";
const OID = "11111111-2222-3333-4444-555555555555";
const PERSONAL = "alex.personal@gmail.test";
const CFG: GraphConfig = { tenantId: "tenant-id", clientId: "client-id", clientSecret: "client-secret", senderUpn: "sender@tenant.test", memberDomain: "contoso.onmicrosoft.test" };

interface Call { method: string; url: string; body: Record<string, unknown> | null }
let calls: Call[];
let guest: Record<string, unknown>;
let convertFailures: { status: number; code: string; message: string }[];
let sendMailFails: boolean;
let logs: string[];

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  calls.push({ method: init?.method ?? "GET", url, body });
  const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (url.includes("/convertExternalToInternalMemberUser")) {
    const f = convertFailures.shift();
    if (f) return json(f.status, { error: { code: f.code, message: f.message } });
    return json(200, { displayName: guest.displayName, userPrincipalName: body!.userPrincipalName, convertedToInternalUserDateTime: "2026-11-10T10:00:00Z" });
  }
  if (url.includes("/sendMail")) return sendMailFails ? json(403, { error: { code: "ErrorAccessDenied", message: `Cannot send to ${PERSONAL}` } }) : new Response(null, { status: 202 });
  if (url.includes("/v1.0/users/")) return json(200, guest);
  return json(404, {});
});

/** Everything written to the DB, events and console must be free of the password and the personal email. */
async function everythingStored(): Promise<string> {
  const [states, events, users] = await Promise.all([prisma.integrationState.findMany(), prisma.event.findMany(), prisma.user.findMany()]);
  return JSON.stringify({ states, events, users }) + logs.join("\n");
}

beforeAll(() => {
  process.env.AUTH_MODE = "demo";
  vi.stubGlobal("fetch", fetchMock);
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation((...a) => void logs.push(a.map(String).join(" ")));
});
afterAll(() => {
  process.env.AUTH_MODE = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  calls = [];
  logs = [];
  convertFailures = [];
  sendMailFails = false;
  fetchMock.mockClear();
  resetGraphTokenCache();
  guest = { id: OID, displayName: "team05-alex-morgan", userType: "Guest", mail: PERSONAL, otherMails: [], userPrincipalName: "alex_gmail.test#EXT#@tenant.test", externalUserState: "Accepted", creationType: "Invitation" };
  await seedDatabase(prisma);
  await prisma.user.update({ where: { id: "alex-morgan" }, data: { entraOid: OID, displayName: "team05-alex-morgan" } });
  // Real templates: reach UNCONDITIONAL_OFFER through the engine (the hook is a no-op under vitest here).
  await simulate("firstadvantage", ALEX, "cleared");
  await runDemoStep("offer_conditions_met", {}, ALEX);
  expect((await js.loadJourney(ALEX))!.currentStage).toBe("UNCONDITIONAL_OFFER");
});

describe("helpers", () => {
  it("builds sanitised team05 UPNs with a numeric suffix on conflict", () => {
    expect(memberLocalPart("team05-Zoë O'Neil-Smith")).toBe("team05-zoe-o-neil-smith");
    expect(memberLocalPart("Jo  Bloggs")).toBe("team05-jo-bloggs");
    expect(candidateUpn("team05-jo-bloggs", "x.test", 1)).toBe("team05-jo-bloggs@x.test");
    expect(candidateUpn("team05-jo-bloggs", "x.test", 3)).toBe("team05-jo-bloggs-3@x.test");
  });
  it("generates 20-char passwords with all four character classes", () => {
    for (let i = 0; i < 50; i++) {
      const p = generateTempPassword();
      expect(p).toHaveLength(20);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[#%+=?@]/);
    }
  });
  it("graphConfig is null unless GUEST_CONVERSION=on and every value is present", () => {
    const env = { GUEST_CONVERSION: "on", NEXT_PUBLIC_ENTRA_TENANT_ID: "t", MYJOURNEY_GRAPH_CLIENT_ID: "c", MYJOURNEY_GRAPH_CLIENT_SECRET: "s", MYJOURNEY_MAIL_SENDER_UPN: "m@x.test", MEMBER_UPN_DOMAIN: "x.onmicrosoft.test" };
    expect(graphConfig(env)).toMatchObject({ memberDomain: "x.onmicrosoft.test" });
    expect(graphConfig({ ...env, GUEST_CONVERSION: "" })).toBeNull();
    expect(graphConfig({ ...env, MEMBER_UPN_DOMAIN: "" })).toBeNull();
    expect(graphConfig({ ...env, MYJOURNEY_GRAPH_CLIENT_SECRET: "" })).toBeNull();
  });
});

describe("convertStarterToMember", () => {
  it("converts, sends the personal-address email, updates the UPN and completes the task", async () => {
    const r = await convertStarterToMember(ALEX, { config: CFG });
    expect(r).toEqual({ status: "converted", upn: "team05-alex-morgan@contoso.onmicrosoft.test", emailSent: true });

    const get = calls[0];
    expect(get.method).toBe("GET");
    expect(get.url).toContain(`/v1.0/users/${OID}?$select=id,displayName,userType,mail,otherMails,userPrincipalName,externalUserState,creationType`);

    const conv = calls.find((c) => c.url.includes("/beta/users/") && c.url.includes("convertExternalToInternalMemberUser"))!;
    expect(conv.url).toBe(`https://graph.microsoft.com/beta/users/${OID}/convertExternalToInternalMemberUser`);
    expect(conv.body).toMatchObject({ userPrincipalName: "team05-alex-morgan@contoso.onmicrosoft.test", passwordProfile: { forceChangePasswordNextSignIn: true } });
    const password = (conv.body!.passwordProfile as { password: string }).password;
    expect(password.length).toBeGreaterThanOrEqual(16);

    const mail = calls.find((c) => c.url.includes("/sendMail"))!;
    expect(mail.url).toBe("https://graph.microsoft.com/v1.0/users/sender%40tenant.test/sendMail");
    const msg = mail.body!.message as { subject: string; body: { contentType: string; content: string }; toRecipients: { emailAddress: { address: string } }[] };
    expect(msg.toRecipients).toEqual([{ emailAddress: { address: PERSONAL } }]);
    expect(msg.subject).toBe("You're now a Lloyds Banking Group colleague");
    expect(msg.body.contentType).toBe("HTML");
    expect(msg.body.content).toContain("team05-alex-morgan@contoso.onmicrosoft.test");
    expect(msg.body.content).toContain(password);
    expect(msg.body.content).toMatch(/change this password and set up the Microsoft Authenticator app/);
    expect(msg.body.content).toContain("http://localhost:3000");

    expect((await prisma.user.findUnique({ where: { id: "alex-morgan" } }))!.upn).toBe("team05-alex-morgan@contoso.onmicrosoft.test");
    expect((await prisma.user.findUnique({ where: { id: "alex-morgan" } }))!.entraOid).toBe(OID);
    const state = (await prisma.integrationState.findUnique({ where: { journeyId_adapterKey: { journeyId: ALEX, adapterKey: "identity" } } }))!;
    expect(state.status).toBe("converted");
    expect(state.payload).toMatchObject({ upn: "team05-alex-morgan@contoso.onmicrosoft.test", emailSent: true });
    expect((await js.loadJourney(ALEX))!.tasks.find((t) => t.key === "internal-account-created")!.status).toBe("DONE");
    const types = (await js.listEvents(ALEX)).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["GUEST_CONVERTED_TO_MEMBER", "MEMBER_WELCOME_EMAIL_SENT"]));

    const stored = await everythingStored();
    expect(stored).not.toContain(password);
    expect(stored).not.toContain(PERSONAL);
    expect(stored).not.toContain("client-secret");
    expect(await getWorkAccountStatus(ALEX)).toMatchObject({ state: "converted", emailSent: true, upn: "team05-alex-morgan@contoso.onmicrosoft.test" });
  });

  it("falls back to otherMails[0] for the personal address", async () => {
    guest = { ...guest, mail: null, otherMails: ["other.address@gmail.test"] };
    await convertStarterToMember(ALEX, { config: CFG });
    const mail = calls.find((c) => c.url.includes("/sendMail"))!;
    expect((mail.body!.message as { toRecipients: { emailAddress: { address: string } }[] }).toRecipients[0].emailAddress.address).toBe("other.address@gmail.test");
  });

  it("adds a numeric suffix when Graph reports a UPN conflict", async () => {
    convertFailures = [{ status: 400, code: "Request_BadRequest", message: "Another object with the same value for property userPrincipalName already exists." }];
    const r = await convertStarterToMember(ALEX, { config: CFG });
    expect(r).toMatchObject({ status: "converted", upn: "team05-alex-morgan-2@contoso.onmicrosoft.test" });
    expect(calls.filter((c) => c.url.includes("convertExternal")).map((c) => c.body!.userPrincipalName)).toEqual(["team05-alex-morgan@contoso.onmicrosoft.test", "team05-alex-morgan-2@contoso.onmicrosoft.test"]);
  });

  it("refuses non-team05 users, non-guests and non-starters, without calling convert", async () => {
    await prisma.user.update({ where: { id: "alex-morgan" }, data: { displayName: "Alex Morgan" } });
    expect(await convertStarterToMember(ALEX, { config: CFG })).toMatchObject({ status: "refused" });
    expect(calls).toHaveLength(0);

    await prisma.user.update({ where: { id: "alex-morgan" }, data: { displayName: "team05-alex-morgan" } });
    guest = { ...guest, userType: "Member" };
    expect(await convertStarterToMember(ALEX, { config: CFG })).toMatchObject({ status: "refused" });
    guest = { ...guest, userType: "Guest", displayName: "Some Real Person" };
    expect(await convertStarterToMember(ALEX, { config: CFG })).toMatchObject({ status: "refused" });
    expect(calls.some((c) => c.url.includes("convertExternal"))).toBe(false);

    await prisma.user.update({ where: { id: "alex-morgan" }, data: { entraOid: null } });
    expect(await convertStarterToMember(ALEX, { config: CFG })).toMatchObject({ status: "refused", reason: expect.stringMatching(/Entra/) });
  });

  it("does not convert without a personal email to deliver the password to", async () => {
    guest = { ...guest, mail: null, otherMails: [] };
    expect(await convertStarterToMember(ALEX, { config: CFG })).toMatchObject({ status: "failed", code: "no_personal_email" });
    expect(calls.some((c) => c.url.includes("convertExternal"))).toBe(false);
  });

  it("is idempotent: a second run does not call Graph again", async () => {
    await convertStarterToMember(ALEX, { config: CFG });
    calls = [];
    expect(await convertStarterToMember(ALEX, { config: CFG })).toEqual({ status: "already_converted", upn: "team05-alex-morgan@contoso.onmicrosoft.test" });
    expect(calls).toHaveLength(0);
  });

  it("concurrent runs convert once", async () => {
    const [a, b] = await Promise.all([convertStarterToMember(ALEX, { config: CFG }), convertStarterToMember(ALEX, { config: CFG })]);
    expect([a.status, b.status].sort()).toEqual(["converted", "in_progress"]);
    expect(calls.filter((c) => c.url.includes("convertExternal"))).toHaveLength(1);
  });

  it("records a failure with a redacted Graph error, then a retry succeeds", async () => {
    convertFailures = [{ status: 403, code: "Authorization_RequestDenied", message: `Insufficient privileges for ${PERSONAL}` }];
    const r = await convertStarterToMember(ALEX, { config: CFG });
    expect(r).toMatchObject({ status: "failed", code: "Authorization_RequestDenied" });
    const w = await getWorkAccountStatus(ALEX);
    expect(w.state).toBe("failed");
    expect(w.error).toContain("Authorization_RequestDenied");
    expect(w.error).not.toContain(PERSONAL);
    expect((await prisma.user.findUnique({ where: { id: "alex-morgan" } }))!.upn).not.toContain("contoso");
    expect((await js.listEvents(ALEX)).map((e) => e.type)).toContain("GUEST_CONVERSION_FAILED");
    expect(await everythingStored()).not.toContain(PERSONAL);

    expect(await convertStarterToMember(ALEX, { config: CFG })).toMatchObject({ status: "converted" });
    expect((await getWorkAccountStatus(ALEX)).state).toBe("converted");
  });

  it("keeps the conversion when the email fails, flags it, and never re-converts", async () => {
    sendMailFails = true;
    const r = await convertStarterToMember(ALEX, { config: CFG });
    expect(r).toMatchObject({ status: "converted", emailSent: false });
    const w = await getWorkAccountStatus(ALEX);
    expect(w).toMatchObject({ state: "converted", emailSent: false });
    expect(w.error).not.toContain(PERSONAL);
    expect((await js.loadJourney(ALEX))!.tasks.find((t) => t.key === "internal-account-created")!.status).toBe("DONE");
    expect((await js.listEvents(ALEX)).map((e) => e.type)).toContain("MEMBER_WELCOME_EMAIL_FAILED");
    expect(await everythingStored()).not.toContain(PERSONAL);
    calls = [];
    expect((await convertStarterToMember(ALEX, { config: CFG })).status).toBe("already_converted");
    expect(calls).toHaveLength(0);
  });

  it("simulates when not configured: no Graph call, recorded and visible, UPN unchanged", async () => {
    const before = (await prisma.user.findUnique({ where: { id: "alex-morgan" } }))!.upn;
    const r = await convertStarterToMember(ALEX, { config: null });
    expect(r).toMatchObject({ status: "simulated" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await prisma.user.findUnique({ where: { id: "alex-morgan" } }))!.upn).toBe(before);
    expect(await getWorkAccountStatus(ALEX)).toMatchObject({ state: "simulated" });
    expect((await js.listEvents(ALEX)).map((e) => e.type)).toContain("GUEST_CONVERSION_SIMULATED");
    expect((await js.loadJourney(ALEX))!.tasks.find((t) => t.key === "internal-account-created")!.status).not.toBe("DONE");
    // A later configured run still converts.
    expect((await convertStarterToMember(ALEX, { config: CFG })).status).toBe("converted");
  });
});

describe("POST /api/admin/journeys/[id]/convert guards", () => {
  const call = async (userId: string | null, id = ALEX) =>
    convertPost(
      new Request(`http://localhost/api/admin/journeys/${id}/convert`, {
        method: "POST",
        headers: { ...(userId ? { cookie: `${DEMO_COOKIE}=${await signDemoSession(userId)}` } : {}), "content-type": "application/json" },
        body: "{}",
      }),
      { params: Promise.resolve({ id }) },
    );

  it("401 anonymous, 403 for starter, LM and buddy", async () => {
    expect((await call(null)).status).toBe(401);
    for (const who of ["alex-morgan", "dana-sample", "kai-demo"]) expect((await call(who)).status, who).toBe(403);
  });

  it("allows P&P and Admin; 404 for an unknown journey; 409 when refused", async () => {
    const admin = (await prisma.user.findMany()).find((u) => (u.roles as string[]).includes("ADMIN"))!.id;
    const pnp = (await prisma.user.findMany()).find((u) => (u.roles as string[]).includes("PNP"))!.id;
    expect((await call(admin, "nope")).status).toBe(404);
    const r = await call(pnp);
    expect(r.status).toBe(200);
    expect((await r.json()).status).toBe("simulated"); // test env has no GUEST_CONVERSION
    await prisma.user.update({ where: { id: "alex-morgan" }, data: { displayName: "Alex Morgan" } });
    expect((await call(admin)).status).toBe(409);
  });
});
