import { describe, expect, it, vi } from "vitest";
import { sign } from "./hmac";
import type { Offer } from "./store";
import { buildWebhookPayload, fetchDirectory, sendOfferAccepted } from "./webhook";

const offer: Offer = {
  id: "wd-offer-1",
  token: "t".repeat(32),
  jobTitle: "Engineer",
  jobFamily: "ENGINEERING",
  teamKey: "dwe",
  teamName: "DWE",
  lineManagerKey: "dana",
  lineManagerName: "Dana",
  startDate: "2027-01-11",
  conditions: ["References"],
  salary: "£XX,XXX (example)",
  status: "invite_simulated",
  createdAt: "",
  expiresAt: "",
  candidate: { firstName: "Jo", lastName: "Bloggs", email: "jo.private@example.com" },
};
const secret = "s".repeat(32);
const payload = buildWebhookPayload(offer, { objectId: null, inviteStatus: "simulated" });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

describe("webhook payload", () => {
  it("never contains email fields or the token", () => {
    const s = JSON.stringify(payload);
    expect(s).not.toContain("example.com");
    expect(s).not.toMatch(/email/i);
    expect(s).not.toContain(offer.token);
    expect(payload.candidate).toEqual({ firstName: "Jo", lastName: "Bloggs" });
  });
});

describe("sendOfferAccepted", () => {
  it("signs the raw body per the contract and returns journeyId", async () => {
    const f = vi.fn(async () => json({ journeyId: "j1", starterId: "s1" }));
    const r = await sendOfferAccepted({ fetch: f as unknown as typeof fetch, baseUrl: "http://localhost:3000/", secret, payload });
    expect(r).toEqual({ ok: true, journeyId: "j1", starterId: "s1" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/api/integrations/workday/offer-accepted");
    const h = init.headers as Record<string, string>;
    expect(h["x-workday-signature"]).toBe(sign(secret, h["x-workday-timestamp"], init.body as string));
    expect(init.body as string).not.toMatch(/email/i);
  });

  it("retries 5xx and network errors with exponential backoff", async () => {
    const f = vi.fn().mockResolvedValueOnce(json({}, 500)).mockRejectedValueOnce(new Error("net")).mockResolvedValueOnce(json({ journeyId: "j2" }));
    const sleeps: number[] = [];
    const r = await sendOfferAccepted({ fetch: f as unknown as typeof fetch, baseUrl: "http://x", secret, payload, backoffMs: 100, sleep: async (ms) => void sleeps.push(ms) });
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it("does not retry 4xx", async () => {
    const f = vi.fn(async () => json({}, 409));
    const r = await sendOfferAccepted({ fetch: f as unknown as typeof fetch, baseUrl: "http://x", secret, payload, sleep: async () => {} });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempts and never throws", async () => {
    const f = vi.fn(async () => { throw new Error("down"); });
    const r = await sendOfferAccepted({ fetch: f as unknown as typeof fetch, baseUrl: "http://x", secret, payload, attempts: 3, sleep: async () => {} });
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(3);
  });
});

describe("fetchDirectory", () => {
  it("sends the empty-body signature", async () => {
    const f = vi.fn(async () => json({ teams: [] }));
    await fetchDirectory({ fetch: f as unknown as typeof fetch, baseUrl: "http://x", secret });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    const h = init.headers as Record<string, string>;
    expect(h["x-workday-signature"]).toBe(sign(secret, h["x-workday-timestamp"], ""));
  });
});

describe("webhook payload jobFamily", () => {
  it("includes jobFamily from the explicit field list", () => {
    expect(payload.jobFamily).toBe("ENGINEERING");
    expect(buildWebhookPayload({ ...offer, jobFamily: "OPERATIONS" }, { objectId: null, inviteStatus: "simulated" }).jobFamily).toBe("OPERATIONS");
    expect(Object.keys(payload).sort()).toEqual(["candidate", "conditions", "guest", "jobFamily", "jobTitle", "lineManagerKey", "offerId", "startDate", "teamKey"]);
  });
});
