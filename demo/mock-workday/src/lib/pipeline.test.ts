import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRedeemUrls, getRedeemUrl, recruiterView, runAcceptPipeline } from "./pipeline";
import { acceptOffer, candidateView, createOffer, getOfferById, resetForRetry, type Offer } from "./store";
import { GET as candidateGet } from "@/app/api/offers/[token]/route";
import { GET as recruiterGet } from "@/app/api/recruiter/offers/route";

const dir = mkdtempSync(path.join(tmpdir(), "wd-pipe-"));
process.env.MOCK_WORKDAY_DATA_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  rmSync(path.join(dir, "offers.json"), { force: true });
  clearRedeemUrls();
});

const SECRET = "super-secret-client-value-9876";
const input = { jobTitle: "Engineer", jobFamily: "ENGINEERING" as const, teamKey: "dwe", teamName: "DWE", lineManagerKey: "dana", lineManagerName: "Dana", startDate: "2027-01-11", conditions: ["References"] };
const cand = { firstName: "Jo", lastName: "Bloggs", email: "jo.bloggs@gmail.com" };

async function accepted(): Promise<Offer> {
  const o = await createOffer(input);
  const r = await acceptOffer(o.token, cand);
  if (!r.ok) throw new Error("accept failed");
  return r.offer;
}
const onboard = (status: Offer["status"] = "onboarded") => vi.fn(async (id: string) => {
  const o = await getOfferById(id);
  return o && ({ ...o, status } as Offer);
});
const graphOk = () => vi.fn(async () => new Response(JSON.stringify({ invitedUser: { id: "guest-1" }, inviteRedeemUrl: "https://login.microsoftonline.com/redeem?token=abc" }), { status: 201 }));

describe("accept pipeline", () => {
  it("approved + credentials: calls Graph once with the right body, then the webhook", async () => {
    const o = await accepted();
    const f = graphOk();
    const notify = onboard();
    await runAcceptPipeline(o.id, { fetch: f as unknown as typeof fetch, getToken: async () => "app-token", approved: true, hasCredentials: true, notify, redirectUrl: "https://mj.example" });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.microsoft.com/v1.0/invitations");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer app-token");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ invitedUserEmailAddress: "jo.bloggs@gmail.com", invitedUserDisplayName: "team05-jo-bloggs", inviteRedirectUrl: "https://mj.example", sendInvitationMessage: true });
    expect(body.invitedUserMessageInfo.customizedMessageBody).toContain("https://mj.example");
    const after = await getOfferById(o.id);
    expect(after).toMatchObject({ inviteStatus: "invited", guestObjectId: "guest-1", status: "invite_sent" });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(getRedeemUrl(o.id)).toContain("redeem");
  });

  it("not approved, or approved without credentials: simulated, no token request and no Graph call", async () => {
    for (const flags of [{ approved: false, hasCredentials: true }, { approved: true, hasCredentials: false }, { approved: false, hasCredentials: false }]) {
      const o = await accepted();
      const f = vi.fn();
      const getToken = vi.fn();
      const notify = onboard();
      await runAcceptPipeline(o.id, { fetch: f as unknown as typeof fetch, getToken, notify, ...flags });
      expect(f).not.toHaveBeenCalled();
      expect(getToken).not.toHaveBeenCalled();
      expect(await getOfferById(o.id)).toMatchObject({ inviteStatus: "simulated", status: "invite_simulated" });
      expect(notify).toHaveBeenCalledTimes(1);
      expect(getRedeemUrl(o.id)).toBeUndefined();
    }
  });

  it("Graph 403: invite failed with a reason, webhook not called, Retry allows exactly one more attempt", async () => {
    const o = await accepted();
    const f = vi.fn(async () => new Response("{}", { status: 403 }));
    const notify = onboard();
    const deps = { fetch: f as unknown as typeof fetch, getToken: async () => "t", approved: true, hasCredentials: true, notify, sleep: async () => {} };
    await runAcceptPipeline(o.id, deps);
    const failed = await getOfferById(o.id);
    expect(failed).toMatchObject({ status: "failed", inviteStatus: "failed" });
    expect(failed?.error).toMatch(/User\.Invite\.All/);
    expect(notify).not.toHaveBeenCalled();
    expect(f).toHaveBeenCalledTimes(1);
    // Without a retry the failed offer is not re-invited.
    await runAcceptPipeline(o.id, deps);
    expect(f).toHaveBeenCalledTimes(1);
    // Retry resets the claim: one more attempt.
    await resetForRetry(o.id);
    await runAcceptPipeline(o.id, { ...deps, fetch: graphOk() as unknown as typeof fetch });
    expect(await getOfferById(o.id)).toMatchObject({ status: "invite_sent", inviteStatus: "invited" });
  });

  it("retries 429/503 with backoff, then succeeds, still one invitation", async () => {
    const o = await accepted();
    const f = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 429 })).mockResolvedValueOnce(new Response("{}", { status: 503 })).mockResolvedValueOnce(graphOk()());
    const sleep = vi.fn(async () => {});
    await runAcceptPipeline(o.id, { fetch: f as unknown as typeof fetch, getToken: async () => "t", approved: true, hasCredentials: true, notify: onboard(), sleep });
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect((await getOfferById(o.id))?.inviteStatus).toBe("invited");
  });

  it("is idempotent per offer: concurrent and repeated runs send one invite", async () => {
    const o = await accepted();
    const f = graphOk();
    const notify = onboard();
    const deps = { fetch: f as unknown as typeof fetch, getToken: async () => "t", approved: true, hasCredentials: true, notify };
    await Promise.all([runAcceptPipeline(o.id, deps), runAcceptPipeline(o.id, deps), runAcceptPipeline(o.id, deps)]);
    await runAcceptPipeline(o.id, deps);
    expect(f).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("never lets the client secret reach the store, a view, or the logs, even when msal throws it", async () => {
    const logs: string[] = [];
    const spies = (["log", "error", "warn", "info"] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(" "))));
    process.env.WORKDAY_GRAPH_CLIENT_SECRET = SECRET;
    try {
      const o = await accepted();
      await runAcceptPipeline(o.id, { fetch: vi.fn() as unknown as typeof fetch, getToken: async () => { throw new Error(`invalid_client ${SECRET}`); }, approved: true, hasCredentials: true, notify: onboard() });
      const stored = readFileSync(path.join(dir, "offers.json"), "utf8");
      const after = await getOfferById(o.id);
      expect(after?.status).toBe("failed");
      expect(stored).not.toContain(SECRET);
      expect(JSON.stringify(recruiterView(after as Offer))).not.toContain(SECRET);
      expect(logs.join("\n")).not.toContain(SECRET);
      const res = await recruiterGet(new Request("http://localhost:3001/api/recruiter/offers"), undefined);
      expect(await res.text()).not.toContain(SECRET);
    } finally {
      spies.forEach((s) => s.mockRestore());
      delete process.env.WORKDAY_GRAPH_CLIENT_SECRET;
    }
  });

  it("the redeem URL and personal email reach the recruiter console only, never the candidate API or the store", async () => {
    const o = await accepted();
    await runAcceptPipeline(o.id, { fetch: graphOk() as unknown as typeof fetch, getToken: async () => "t", approved: true, hasCredentials: true, notify: onboard() });
    const redeem = "https://login.microsoftonline.com/redeem?token=abc";
    expect(getRedeemUrl(o.id)).toBe(redeem);
    expect(readFileSync(path.join(dir, "offers.json"), "utf8")).not.toContain("redeem");
    const stored = (await getOfferById(o.id)) as Offer;
    expect(JSON.stringify(candidateView(stored))).not.toContain("redeem");
    const cres = await candidateGet(new Request("http://localhost:3001/api/offers/x"), { params: Promise.resolve({ token: stored.token }) });
    const ctext = await cres.text();
    expect(cres.status).toBe(200);
    expect(ctext).not.toContain("redeem");
    expect(ctext).not.toContain("gmail.com");
    const rres = await recruiterGet(new Request("http://localhost:3001/api/recruiter/offers"), undefined);
    const rj = (await rres.json()) as { offers: { redeemUrl?: string }[] };
    expect(rj.offers[0].redeemUrl).toBe(redeem);
    expect(JSON.stringify(rj)).not.toContain("gmail.com");
  });
});
