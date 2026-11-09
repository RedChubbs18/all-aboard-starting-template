import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { acceptOffer, candidateView, createOffer, getOfferByToken, listOffers, markFailed, markOnboarded, recordInvite, resetForRetry } from "./store";

const dir = mkdtempSync(path.join(tmpdir(), "wd-store-"));
process.env.MOCK_WORKDAY_DATA_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const input = { jobTitle: "Engineer", teamKey: "dwe", teamName: "DWE", lineManagerKey: "dana", lineManagerName: "Dana", startDate: "2027-01-11", conditions: ["References"] };
const cand = { firstName: "Jo", lastName: "Bloggs", email: "jo@example.com" };

beforeEach(() => rmSync(path.join(dir, "offers.json"), { force: true }));

describe("offer store", () => {
  it("creates an offer with an unguessable base64url token", async () => {
    const a = await createOffer(input);
    const b = await createOffer(input);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.status).toBe("sent");
    expect((await listOffers()).length).toBe(2);
    expect(JSON.parse(readFileSync(path.join(dir, "offers.json"), "utf8")).offers.length).toBe(2);
  });

  it("accepts once per token", async () => {
    const o = await createOffer(input);
    const r1 = await acceptOffer(o.token, cand);
    expect(r1.ok && r1.offer.status).toBe("accepted_pending_invite");
    expect(await acceptOffer(o.token, cand)).toEqual({ ok: false, reason: "used" });
    expect(await acceptOffer("nope", cand)).toEqual({ ok: false, reason: "not_found" });
  });

  it("serialises concurrent acceptances so only one wins", async () => {
    const o = await createOffer(input);
    const rs = await Promise.all([acceptOffer(o.token, cand), acceptOffer(o.token, cand), acceptOffer(o.token, cand)]);
    expect(rs.filter((r) => r.ok).length).toBe(1);
  });

  it("rejects expired offers", async () => {
    const o = await createOffer(input, new Date(Date.now() - 30 * 86_400_000));
    expect(await acceptOffer(o.token, cand)).toEqual({ ok: false, reason: "expired" });
  });

  it("walks statuses: invite simulated -> onboarded, and failed -> retry", async () => {
    const o = await createOffer(input);
    await acceptOffer(o.token, cand);
    expect((await recordInvite(o.id, { guestObjectId: null, inviteStatus: "simulated" }))?.status).toBe("invite_simulated");
    expect((await markOnboarded(o.id, "j1"))?.status).toBe("onboarded");

    const p = await createOffer(input);
    await acceptOffer(p.token, cand);
    expect((await recordInvite(p.id, { guestObjectId: "g", inviteStatus: "invited" }))?.status).toBe("invite_sent");
    await markFailed(p.id, "boom");
    expect((await resetForRetry(p.id))?.status).toBe("invite_sent");

    const q = await createOffer(input);
    await acceptOffer(q.token, cand);
    expect((await recordInvite(q.id, { guestObjectId: null, inviteStatus: "failed", error: "x" }))?.status).toBe("failed");
    expect((await resetForRetry(q.id))?.status).toBe("accepted_pending_invite");
  });

  it("candidate view never contains the email and finds offers only by their own token", async () => {
    const o = await createOffer(input);
    await acceptOffer(o.token, cand);
    const found = await getOfferByToken(o.token);
    expect(JSON.stringify(candidateView(found!))).not.toContain("example.com");
    expect(await getOfferByToken("x".repeat(32))).toBeNull();
  });
});
