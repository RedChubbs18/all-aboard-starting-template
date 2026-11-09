import { describe, expect, it, vi } from "vitest";
import { buildInvitationBody, guestDisplayName, runInvite } from "./graph";

const base = { email: "jo@example.com", firstName: "Jo", lastName: "Bloggs", redirectUrl: "http://localhost:3000" };

describe("buildInvitationBody", () => {
  it("lets Entra send the email, with team05 display name and MyJourney instructions", () => {
    const b = buildInvitationBody(base);
    expect(b.sendInvitationMessage).toBe(true);
    expect(b.invitedUserEmailAddress).toBe("jo@example.com");
    expect(b.invitedUserDisplayName).toBe("team05-jo-bloggs");
    expect(b.inviteRedirectUrl).toBe("http://localhost:3000");
    expect(b.invitedUserMessageInfo.customizedMessageBody).toContain("http://localhost:3000");
    expect(b.invitedUserMessageInfo.customizedMessageBody).toMatch(/accept the invitation/i);
    expect(b.invitedUserMessageInfo.customizedMessageBody).toMatch(/sign in/i);
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

  it("approved: POSTs /invitations with a bearer token and returns the guest id", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ invitedUser: { id: "guest-1" } }), { status: 201 }));
    const r = await runInvite({ ...base, fetch: f as unknown as typeof fetch, getToken: async () => "tok", approved: true });
    expect(r).toEqual({ status: "invited", guestObjectId: "guest-1" });
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
