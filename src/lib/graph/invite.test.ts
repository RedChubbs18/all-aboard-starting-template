import { describe, expect, it, vi } from "vitest";
import { allowedDemoMailbox, buildInvitationBody, guestDisplayName, sendGraphInvite } from "./invite";
import { buildWelcomeEmail } from "./email";

const GUID = "11111111-2222-3333-4444-555555555555";
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

function input(fetchFn: typeof fetch, over: Partial<Parameters<typeof sendGraphInvite>[0]> = {}) {
  return {
    fetch: fetchFn,
    accessToken: "tok",
    adminUpn: "team05-admin@contoso.example",
    demoMailbox: "team05-inbox@contoso.example",
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
  it("never sends Microsoft's own invitation message", () => {
    expect(buildInvitationBody({ email: "a@b.example", displayName: "team05-a-b", redirectUrl: "http://localhost:3000" })).toEqual({
      invitedUserEmailAddress: "a@b.example",
      invitedUserDisplayName: "team05-a-b",
      inviteRedirectUrl: "http://localhost:3000",
      sendInvitationMessage: false,
    });
  });
});

describe("allowedDemoMailbox", () => {
  const admin = "team05-admin@contoso.example";
  it("allows only the admin's own domain", () => {
    expect(allowedDemoMailbox("box@contoso.example", admin)).toBe("box@contoso.example");
    expect(allowedDemoMailbox("box@CONTOSO.example", admin)).toBe("box@CONTOSO.example");
  });
  it("refuses unset, external, look-alike and multi-recipient values", () => {
    for (const bad of [undefined, "", "box@gmail.com", "box@evil-contoso.example", "box@sub.contoso.example", "box@contoso.example.evil.com", "a@contoso.example;b@gmail.com", "a@contoso.example,b@gmail.com", "x@y@contoso.example", "box"]) {
      expect(allowedDemoMailbox(bad, admin), String(bad)).toBeNull();
    }
    expect(allowedDemoMailbox("box@contoso.example", undefined)).toBeNull();
  });
});

describe("sendGraphInvite", () => {
  it("invites then mails the redeem link to the demo mailbox only", async () => {
    const f = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith("/invitations") ? json(201, { inviteRedeemUrl: "https://redeem.example/x", invitedUser: { id: GUID } }) : json(202),
    );
    const r = await sendGraphInvite(input(f));
    expect(r).toEqual({ status: "invited", guestObjectId: GUID, mailSent: true });
    expect(f).toHaveBeenCalledTimes(2);

    const [invUrl, invInit] = f.mock.calls[0];
    expect(invUrl).toBe("https://graph.microsoft.com/v1.0/invitations");
    expect((invInit!.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(invInit!.body as string)).toEqual({
      invitedUserEmailAddress: "pat.sample@personal.example",
      invitedUserDisplayName: "team05-pat-sample",
      inviteRedirectUrl: "http://localhost:3000",
      sendInvitationMessage: false,
    });

    const [mailUrl, mailInit] = f.mock.calls[1];
    expect(mailUrl).toBe("https://graph.microsoft.com/v1.0/me/sendMail");
    const mail = JSON.parse(mailInit!.body as string);
    expect(mail.message.toRecipients).toEqual([{ emailAddress: { address: "team05-inbox@contoso.example" } }]);
    expect(mail.message.body.content).toContain("https://redeem.example/x");
    expect(mail.message.body.content).toContain("In production this goes to pat.sample@personal.example");
  });

  it("refuses an external mailbox before calling Graph at all", async () => {
    const f = vi.fn<typeof fetch>();
    for (const demoMailbox of [undefined, "someone@gmail.com", "team05-inbox@other.example"]) {
      expect(await sendGraphInvite(input(f, { demoMailbox }))).toEqual({ status: "fallback", reason: "mailbox_not_allowed" });
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("falls back on 403 and 401 (consent required) without sending mail", async () => {
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

  it("reports the invite as made but mailSent=false when sendMail fails", async () => {
    const f = vi.fn<typeof fetch>(async (url) => (String(url).endsWith("/invitations") ? json(201, { inviteRedeemUrl: "https://r.example", invitedUser: { id: GUID } }) : json(403)));
    expect(await sendGraphInvite(input(f))).toEqual({ status: "invited", guestObjectId: GUID, mailSent: false });
  });
});

describe("buildWelcomeEmail", () => {
  it("escapes HTML in names and links", () => {
    const m = buildWelcomeEmail({ starterName: "<script>x</script>", redeemUrl: 'https://a.example/?q="1"' });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain('q="1"');
  });
  it("omits the production line when there is no production recipient", () => {
    expect(buildWelcomeEmail({ starterName: "A", redeemUrl: "https://a.example" }).text).not.toContain("In production");
  });
});
