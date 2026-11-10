import { describe, expect, it, vi } from "vitest";
import { buildInvitationBody, guestDisplayName, runInvite } from "./graph";

const base = { email: "jo@example.com", firstName: "Jo", lastName: "Bloggs", redirectUrl: "http://localhost:3000" };

describe("buildInvitationBody", () => {
  it("lets Entra send the email, with team05 display name and MyJourney instructions", () => {
    const b = buildInvitationBody(base);
    expect(b.sendInvitationMessage).toBe(true);
    expect(b.invitedUserEmailAddress).toBe("jo@example.com");
    expect(b.invitedUserDisplayName).toBe("team05-jo-bloggs");
    // Graph rejects http redirect URLs, so localhost falls back to My Apps (https); the email still names MyJourney.
    expect(b.inviteRedirectUrl).toMatch(/^https:\/\/myapplications\.microsoft\.com\//);
    expect(b.invitedUserMessageInfo.customizedMessageBody).toContain("http://localhost:3000");
    expect(b.invitedUserMessageInfo.customizedMessageBody).toMatch(/Accept invitation/);
    expect(b.invitedUserMessageInfo.customizedMessageBody).toMatch(/sign in/i);
    expect(b.invitedUserMessageInfo.customizedMessageBody).toContain("on behalf of Lloyds Banking Group (MyJourney)");
    expect(b.invitedUserMessageInfo.customizedMessageBody).toMatch(/one-time passcode/);
  });
  it("sanitises display names", () => expect(guestDisplayName("Zoë", "O'Neil-Smith")).toBe("team05-zoe-oneilsmith"));
});

describe("runInvite", () => {
  it("not approved: simulates with no token request and no Graph call", async () => {
    const f = vi.fn();
    const getToken = vi.fn();
    const r = await runInvite({ ...base, fetch: f as unknown as typeof fetch, getToken, approved: false });
    expect(r.status).toBe("simulated");
    if (r.status === "simulated") {
      expect(r.message).toContain("MyJourney");
      expect(r.message).not.toContain("example.com");
    }
    expect(f).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
  });

  it("returns inviteRedeemUrl for a Gmail address (request body unchanged)", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ invitedUser: { id: "g2" }, inviteRedeemUrl: "https://login.microsoftonline.com/redeem?x=1" }), { status: 201 }));
    const r = await runInvite({ ...base, email: "jo.bloggs@gmail.com", fetch: f as unknown as typeof fetch, getToken: async () => "tok", approved: true });
    expect(r).toEqual({ status: "invited", guestObjectId: "g2", inviteRedeemUrl: "https://login.microsoftonline.com/redeem?x=1" });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).invitedUserEmailAddress).toBe("jo.bloggs@gmail.com");
  });

  it("approved: POSTs /invitations with a bearer token and returns the guest id", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ invitedUser: { id: "guest-1" } }), { status: 201 }));
    const r = await runInvite({ ...base, fetch: f as unknown as typeof fetch, getToken: async () => "tok", approved: true });
    expect(r).toEqual({ status: "invited", guestObjectId: "guest-1", inviteRedeemUrl: undefined });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.microsoft.com/v1.0/invitations");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string).sendInvitationMessage).toBe(true);
  });

  it("reports failure without throwing (no token, 403, network)", async () => {
    expect((await runInvite({ ...base, fetch: vi.fn() as unknown as typeof fetch, getToken: async () => null, approved: true })).status).toBe("failed");
    const f403 = vi.fn(async () => new Response("{}", { status: 403 }));
    expect((await runInvite({ ...base, fetch: f403 as unknown as typeof fetch, getToken: async () => "t", approved: true })).status).toBe("failed");
    const fnet = vi.fn(async () => { throw new Error("x"); });
    expect((await runInvite({ ...base, fetch: fnet as unknown as typeof fetch, getToken: async () => "t", approved: true })).status).toBe("failed");
  });
});

describe("graphErrorDetail", () => {
  it("returns Graph's code and message with emails redacted", async () => {
    const { graphErrorDetail } = await import("./graph");
    const res = { json: async () => ({ error: { code: "BadRequest", message: "The invited user jo@gmail.com already exists" } }) };
    expect(await graphErrorDetail(res)).toBe(" (BadRequest: The invited user [email] already exists)");
  });
  it("returns an empty string when the body is not JSON", async () => {
    const { graphErrorDetail } = await import("./graph");
    expect(await graphErrorDetail({ json: async () => { throw new Error("no"); } })).toBe("");
  });
});

describe("inviteRedirectFor", () => {
  it("keeps an https MyJourney URL", async () => {
    const { inviteRedirectFor } = await import("./graph");
    expect(inviteRedirectFor("https://myjourney.example.devtunnels.ms", "t-1")).toBe("https://myjourney.example.devtunnels.ms");
  });
  it("falls back to My Apps for our tenant when MyJourney is http or invalid", async () => {
    const { inviteRedirectFor } = await import("./graph");
    expect(inviteRedirectFor("http://localhost:3000", "t-1")).toBe("https://myapplications.microsoft.com/?tenantid=t-1");
    expect(inviteRedirectFor("not a url", undefined)).toBe("https://myapplications.microsoft.com/");
  });
});
