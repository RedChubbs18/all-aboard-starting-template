import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST, GET } from "@/app/api/chat/route";
import { DEMO_COOKIE, signDemoSession } from "@/lib/auth/server";
import { prisma } from "./db";
import { RATE_LIMIT, askAssistant, getPnpContact, linkCitations, loadCorpus, resetRateLimits, takeRateLimit } from "./chat-service";

const P = "chat-";

beforeAll(async () => {
  await prisma.faq.create({ data: { id: `${P}faq-pay`, question: "When do I get paid?", answer: "Last working day of the month.", tags: ["pay", "salary"] } });
  await prisma.contentItem.create({ data: { slug: `${P}device-guide`, type: "GUIDE", title: "Choosing your device", summary: "Mac or Windows laptop options.", tags: [] } });
  await prisma.user.create({ data: { id: `${P}starter`, upn: `${P}starter@example.test`, displayName: "Starter", roles: ["STARTER"] } });
  await prisma.user.create({ data: { id: `${P}0pnp`, upn: `${P}pnp@example.test`, displayName: "Pat Pnp", roles: ["PNP"], jobTitle: "P&P Lead" } });
});

afterAll(() => {
  delete process.env.AUTH_MODE;
});

beforeEach(() => resetRateLimits());

describe("chat service", () => {
  it("loads the corpus from the DB with tags", async () => {
    const c = await loadCorpus();
    expect(c.faqs.find((f) => f.id === `${P}faq-pay`)).toMatchObject({ tags: ["pay", "salary"] });
    expect(c.content.find((d) => d.slug === `${P}device-guide`)).toMatchObject({ title: "Choosing your device" });
  });

  it("links citations to the FAQ anchor or content page and drops unknown ids", async () => {
    const c = await loadCorpus();
    expect(
      linkCitations(
        [
          { kind: "faq", id: `${P}faq-pay` },
          { kind: "content", id: `${P}device-guide` },
          { kind: "faq", id: "nope" },
        ],
        c,
      ),
    ).toEqual([
      { kind: "faq", id: `${P}faq-pay`, title: "When do I get paid?", href: `/faq#${P}faq-pay` },
      { kind: "content", id: `${P}device-guide`, title: "Choosing your device", href: `/content/${P}device-guide` },
    ]);
  });

  it("answers through the (mock) adapter with linked citations", async () => {
    const r = await askAssistant("When do I get paid? pay day");
    expect(r.fallback).toBe(false);
    expect(r.citations[0]).toMatchObject({ kind: "faq", href: expect.stringMatching(/^\/faq#/) });
  });

  it("rate limits per user with a sliding window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMIT.max; i++) expect(takeRateLimit("u1", t0 + i).ok).toBe(true);
    const blocked = takeRateLimit("u1", t0 + 100);
    expect(blocked).toMatchObject({ ok: false });
    expect(takeRateLimit("u2", t0 + 100).ok).toBe(true); // other users unaffected
    expect(takeRateLimit("u1", t0 + RATE_LIMIT.windowMs + 1).ok).toBe(true);
  });

  it("finds a P&P contact with a Teams chat link", async () => {
    const c = await getPnpContact();
    expect(c!.teamsUrl).toMatch(/^https:\/\/teams\.microsoft\.com\/l\/chat\/0\/0\?users=/);
    expect(c!.name).toBeTruthy();
  });
});

describe("/api/chat route", () => {
  const req = async (body: unknown, init: { cookie?: boolean; contentType?: string } = {}) => {
    process.env.AUTH_MODE = "demo";
    const headers: Record<string, string> = { "content-type": init.contentType ?? "application/json" };
    if (init.cookie !== false) headers.cookie = `${DEMO_COOKIE}=${await signDemoSession(`${P}starter`)}`;
    return new Request("http://x/api/chat", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
  };

  it("requires sign-in", async () => {
    expect((await POST(await req({ question: "hi" }, { cookie: false }), {})).status).toBe(401);
  });

  it("validates content type and question length", async () => {
    expect((await POST(await req("question=hi", { contentType: "application/x-www-form-urlencoded" }), {})).status).toBe(415);
    expect((await POST(await req({ question: "   " }), {})).status).toBe(400);
    expect((await POST(await req({ question: "x".repeat(501) }), {})).status).toBe(400);
    expect((await POST(await req("{bad json"), {})).status).toBe(400);
  });

  it("answers a signed-in user and returns 429 after the limit", async () => {
    const ok = await POST(await req({ question: "When do I get paid? pay day" }), {});
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ fallback: false, citations: [expect.objectContaining({ kind: "faq" })] });
    for (let i = 1; i < RATE_LIMIT.max; i++) await POST(await req({ question: "pay day" }), {});
    const limited = await POST(await req({ question: "pay day" }), {});
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });

  it("GET returns the P&P contact", async () => {
    process.env.AUTH_MODE = "demo";
    const cookie = `${DEMO_COOKIE}=${await signDemoSession(`${P}starter`)}`;
    const r = await GET(new Request("http://x/api/chat", { headers: { cookie } }), {});
    expect(r.status).toBe(200);
    expect((await r.json()).contact.teamsUrl).toMatch(/^https:\/\/teams/);
  });
});
