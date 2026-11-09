/**
 * Photo check / submit security: fail closed on manual review (M1), photo token key (M2),
 * body size and per-user rate limit (M3), multipart allowed only on photo-check (L5).
 */
import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { seedDatabase } from "@/server/seed";
import { listEvents } from "@/server/journey-service";
import { resetRateLimits, PHOTO_RATE_LIMIT } from "@/server/chat-service";
import { DEMO_COOKIE, signDemoSession } from "@/lib/auth/server";
import { POST as photoCheck } from "./photo-check/route";
import { POST as photoSubmit } from "./photo-submit/route";
import { POST as photoReview } from "./photo-review/route";
import { acceptablePhotoSecret, photoRefSecret, signPhotoRef, verifyPhotoRef } from "./_lib/photo-token";

const ALEX = "alex-morgan";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(60).fill(0)]);
let taskId = "";
let journeyId = "";

const cookie = async (userId = ALEX) => `${DEMO_COOKIE}=${await signDemoSession(userId)}`;

async function checkReq(fileName = "me.jpg", extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set("taskId", taskId);
  form.set("photo", new File([JPEG], fileName, { type: "image/jpeg" }));
  // Serialise like a browser would, so content-type carries the multipart boundary.
  const tmp = new Request("http://localhost/api/starter/photo-check", { method: "POST", body: form });
  return new Request(tmp.url, {
    method: "POST",
    headers: { cookie: await cookie(), "content-type": tmp.headers.get("content-type")!, ...extra },
    body: await tmp.arrayBuffer(),
  });
}

beforeAll(() => {
  process.env.AUTH_MODE = "demo";
});
afterAll(() => {
  process.env.AUTH_MODE = "";
});
beforeEach(async () => {
  await seedDatabase(prisma);
  resetRateLimits();
  delete process.env.ANTHROPIC_API_KEY;
  const j = await prisma.journey.findUnique({ where: { starterId: ALEX }, include: { tasks: true } });
  journeyId = j!.id;
  const t = j!.tasks.find((x) => x.key === "upload-pass-photo")!;
  taskId = t.id;
  // Test setup only: open the photo task so the route can be exercised directly.
  await prisma.task.update({ where: { id: t.id }, data: { status: "TODO", applicable: true } });
});
afterEach(() => {
  delete process.env.ADAPTER_PHOTOCHECK_MODE;
  delete process.env.PHOTO_REF_SECRET;
});

describe("photo-check (M1: fail closed)", () => {
  it("issues a pass token in MOCK mode for a clean photo", async () => {
    const r = await photoCheck(await checkReq(), undefined);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.pass).toBe(true);
    expect(verifyPhotoRef(journeyId, b.photoRef, b.token)).toBe(true);
  });

  it("REAL mode without a working check: no token, marked for manual review, pendingReview returned", async () => {
    process.env.ADAPTER_PHOTOCHECK_MODE = "REAL"; // no ANTHROPIC_API_KEY, so the adapter cannot check
    const r = await photoCheck(await checkReq("perfect.jpg"), undefined);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b).toMatchObject({ pass: false, pendingReview: true });
    expect(b.token).toBeUndefined();
    expect(b.photoRef).toBeUndefined();
    expect(b.issues[0]).toMatch(/reviewed by your line manager or P&P/);
    const state = await prisma.integrationState.findFirst({ where: { journeyId, adapterKey: "photocheck" } });
    expect(state?.status).toBe("action_needed");
    const events = await listEvents(journeyId);
    expect(events.some((e) => e.type === "SUPPORT_RAISED" && (e.data as { reason?: string } | null)?.reason === "photo_check_unavailable")).toBe(true);
  });

  it("REAL mode ignores the file name heuristic (a 'sunglasses' name is not a decision)", async () => {
    process.env.ADAPTER_PHOTOCHECK_MODE = "REAL";
    const b = await (await photoCheck(await checkReq("me-sunglasses.jpg"), undefined)).json();
    expect(b).toMatchObject({ pass: false, pendingReview: true });
  });
});

describe("photo token (M2)", () => {
  it("never uses DEMO_SESSION_SECRET, and rejects placeholder or short PHOTO_REF_SECRET values", () => {
    const demo = process.env.DEMO_SESSION_SECRET!;
    const forged = createHmac("sha256", demo).update(`${journeyId}|PH-x|pass`).digest("hex");
    expect(verifyPhotoRef(journeyId, "PH-x", forged)).toBe(false);
    for (const bad of ["dev-only-change-me-dev-only-change-me-xxxxx", "short", "placeholder-placeholder-placeholder-1", demo]) {
      expect(acceptablePhotoSecret(bad), bad).toBe(false);
      process.env.PHOTO_REF_SECRET = bad;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(photoRefSecret()).not.toBe(bad);
      warn.mockRestore();
    }
  });

  it("uses a strong PHOTO_REF_SECRET when set", () => {
    const good = "9f2c1d7e4b6a8f0e3d5c7b9a1e2f4d6c8b0a2e4f";
    process.env.PHOTO_REF_SECRET = good;
    const expected = createHmac("sha256", good).update(`${journeyId}|PH-y|pass`).digest("hex");
    expect(signPhotoRef(journeyId, "PH-y")).toBe(expected);
    expect(verifyPhotoRef(journeyId, "PH-y", expected)).toBe(true);
  });

  it("photo-submit refuses a token signed with the demo session secret", async () => {
    const forged = createHmac("sha256", process.env.DEMO_SESSION_SECRET!).update(`${journeyId}|PH-forged|pass`).digest("hex");
    const r = await photoSubmit(
      new Request("http://localhost/api/starter/photo-submit", {
        method: "POST",
        headers: { cookie: await cookie(), "content-type": "application/json" },
        body: JSON.stringify({ taskId, photoRef: "PH-forged", token: forged }),
      }),
      undefined,
    );
    expect(r.status).toBe(403);
  });
});

describe("photo-check cost and memory (M3)", () => {
  it("rejects an oversized content-length before parsing", async () => {
    const req = new Request("http://localhost/api/starter/photo-check", {
      method: "POST",
      headers: { cookie: await cookie(), "content-type": "multipart/form-data; boundary=x", "content-length": String(6 * 1024 * 1024) },
      body: "--x--",
    });
    const r = await photoCheck(req, undefined);
    expect(r.status).toBe(413);
  });

  it("rejects an oversized streamed body even without content-length", async () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    const req = new Request("http://localhost/api/starter/photo-check", {
      method: "POST",
      headers: { cookie: await cookie(), "content-type": "multipart/form-data; boundary=x" },
      body: big,
    });
    expect((await photoCheck(req, undefined)).status).toBe(413);
  });

  it(`allows ${PHOTO_RATE_LIMIT.max} checks per user per window, then 429`, async () => {
    for (let i = 0; i < PHOTO_RATE_LIMIT.max; i++) expect((await photoCheck(await checkReq(), undefined)).status).toBe(200);
    const r = await photoCheck(await checkReq(), undefined);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});

describe("CSRF on photo routes (L5)", () => {
  it("photo-check accepts multipart but rejects a cross-origin post", async () => {
    expect((await photoCheck(await checkReq("me.jpg", { origin: "http://localhost" }), undefined)).status).toBe(200);
    expect((await photoCheck(await checkReq("me.jpg", { origin: "http://evil.example" }), undefined)).status).toBe(403);
  });

  it("JSON routes reject multipart and form posts", async () => {
    const form = new FormData();
    form.set("taskId", taskId);
    const tmp = new Request("http://localhost/x", { method: "POST", body: form });
    const multipart = new Request("http://localhost/api/starter/photo-review", {
      method: "POST",
      headers: { cookie: await cookie(), "content-type": tmp.headers.get("content-type")! },
      body: await tmp.arrayBuffer(),
    });
    expect((await photoReview(multipart, undefined)).status).toBe(415);
    const urlenc = new Request("http://localhost/api/starter/photo-review", {
      method: "POST",
      headers: { cookie: await cookie(), "content-type": "application/x-www-form-urlencoded" },
      body: `taskId=${taskId}`,
    });
    expect((await photoReview(urlenc, undefined)).status).toBe(415);
  });
});
