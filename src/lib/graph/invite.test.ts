import { describe, expect, it, vi } from "vitest";
import { GRAPH_INVITE_SCOPES, INVITE_MESSAGE, buildInvitationBody, guestDisplayName, isValidEmail, sendGraphInvite } from "./invite";

const GUID = "11111111-2222-3333-4444-555555555555";
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

function input(fetchFn: typeof fetch, over: Partial<Parameters<typeof sendGraphInvite>[0]> = {}) {
  return {
    fetch: fetchFn,
    accessToken: "tok",
    approved: true,
    personalEmail: "pat.sample@personal.example",
    starterName: "Pat Sample",
    redirectUrl: "http://localhost:3000",
    ...over,
  };
}

describe("guestDisplayName", () => {
  it("follows team05-<first>-<last>, lowercase ASCII", () => {
    expect(guestDisplayName("Pat Sample")).toBe("team05-pat-sample");
    expect(guestDisplayName("  Zoë  O'Neil-Smith ")).toBe("team05-zoe-oneilsmith");
    expect(guestDisplayName("Cher")).toBe("team05-cher");
    expect(guestDisplayName("")).toBe("team05-starter");
  });
});

describe("buildInvitationBody", () => {
  it("asks Entra to send its own invitation with a short message and no ccRecipients", () => {
    const b = buildInvitationBody({ email: "a@b.example", displayName: "team05-a-b", redirectUrl: "http://localhost:3000" });
    expect(b).toEqual({
      invitedUserEmailAddress: "a@b.example",
      invitedUserDisplayName: "team05-a-b",
      inviteRedirectUrl: "http://localhost:3000",
      sendInvitationMessage: true,
      invitedUserMessageInfo: { customizedMessageBody: INVITE_MESSAGE },
    });
    expect(b).not.toHaveProperty("invitedUserMessageInfo.ccRecipients");
  });
});

describe("scopes and email validation", () => {
  it("requests User.Invite.All only", () => expect(GRAPH_INVITE_SCOPES).toEqual(["User.Invite.All"]));
  it("validates format", () => {
    expect(isValidEmail("a.b@c.example")).toBe(true);
    for (const bad of ["", "a", "a@b", "a@b@c.example", "a b@c.example", "a@c.example,d@e.example", "a@c.example;d@e.example"]) expect(isValidEmail(bad), bad).toBe(false);
  });
});

describe("sendGraphInvite", () => {
  it("posts one invitation with sendInvitationMessage true to the typed address and never calls sendMail", async () => {
    const f = vi.fn<typeof fetch>(async () => json(201, { invitedUser: { id: GUID } }));
    expect(await sendGraphInvite(input(f))).toEqual({ status: "invited", guestObjectId: GUID });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://graph.microsoft.com/v1.0/invitations");
    expect(String(url)).not.toContain("sendMail");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const body = JSON.parse(init!.body as string);
    expect(body.sendInvitationMessage).toBe(true);
    expect(body.invitedUserEmailAddress).toBe("pat.sample@personal.example");
    expect(body.invitedUserDisplayName).toBe("team05-pat-sample");
    expect(body.inviteRedirectUrl).toBe("http://localhost:3000");
    expect(body.invitedUserMessageInfo).toEqual({ customizedMessageBody: INVITE_MESSAGE });
  });

  it("refuses without the approval flag, before calling Graph", async () => {
    const f = vi.fn<typeof fetch>();
    expect(await sendGraphInvite(input(f, { approved: false }))).toEqual({ status: "fallback", reason: "not_approved" });
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses an invalid address before calling Graph", async () => {
    const f = vi.fn<typeof fetch>();
    for (const personalEmail of ["", "nope", "a@b.example,c@d.example"]) {
      expect(await sendGraphInvite(input(f, { personalEmail }))).toEqual({ status: "fallback", reason: "invalid_email" });
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("falls back on 403 and 401 (consent required)", async () => {
    for (const status of [403, 401]) {
      const f = vi.fn<typeof fetch>(async () => json(status, { error: { code: "Authorization_RequestDenied" } }));
      expect(await sendGraphInvite(input(f))).toEqual({ status: "fallback", reason: "consent_required" });
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it("falls back on other errors, malformed responses and network failures", async () => {
    expect(await sendGraphInvite(input(async () => json(500)))).toEqual({ status: "fallback", reason: "error" });
    expect(await sendGraphInvite(input(async () => json(201, { invitedUser: {} })))).toEqual({ status: "fallback", reason: "error" });
    expect(await sendGraphInvite(input(async () => Promise.reject(new Error("offline"))))).toEqual({ status: "fallback", reason: "error" });
  });
});
