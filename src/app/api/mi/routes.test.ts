import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { DEMO_COOKIE, signDemoSession } from "@/lib/auth/server";
import { GET as overview } from "./overview/route";
import { GET as journeys } from "./journeys/route";
import { GET as exportCsv } from "./export/route";
import { POST as chase } from "./chase/route";
import { POST as support } from "./support/route";

const ROLE_USERS = ["STARTER", "BUDDY", "LM", "PNP", "ADMIN"] as const;
let cookies: Record<string, string>;

beforeAll(async () => {
  process.env.AUTH_MODE = "demo";
  cookies = {};
  for (const r of ROLE_USERS) {
    const id = `mir-${r.toLowerCase()}`;
    await prisma.user.upsert({ where: { id }, update: { roles: [r] }, create: { id, upn: `${id}@example.test`, displayName: id, roles: [r] } });
    cookies[r] = `${DEMO_COOKIE}=${await signDemoSession(id)}`;
  }
});
afterAll(() => {
  process.env.AUTH_MODE = "";
});

const get = (role: string | null, path = "/api/mi/overview") =>
  new Request(`http://localhost${path}`, { headers: role ? { cookie: cookies[role] } : {} });
const post = (role: string | null, body: unknown) =>
  new Request("http://localhost/api/mi/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...(role ? { cookie: cookies[role] } : {}) } });

describe("MI routes are P&P and admin only", () => {
  it("returns 401 without a session", async () => {
    expect((await overview(get(null), undefined)).status).toBe(401);
  });

  it.each(["STARTER", "BUDDY", "LM"])("returns 403 for %s on every route", async (role) => {
    expect((await overview(get(role), undefined)).status).toBe(403);
    expect((await journeys(get(role, "/api/mi/journeys"), undefined)).status).toBe(403);
    expect((await exportCsv(get(role, "/api/mi/export?type=journeys"), undefined)).status).toBe(403);
    expect((await chase(post(role, { lmId: "x" }), undefined)).status).toBe(403);
    expect((await support(post(role, { journeyId: "x" }), undefined)).status).toBe(403);
  });

  it.each(["PNP", "ADMIN"])("allows %s", async (role) => {
    const r = await overview(get(role), undefined);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.kpis).toBeDefined();
    expect(body.funnel).toHaveLength(5);
    expect((await journeys(get(role, "/api/mi/journeys"), undefined)).status).toBe(200);
  });

  it("exports CSV for PNP and rejects unknown types and bad bodies", async () => {
    for (const type of ["journeys", "issues", "exits", "funnel"]) {
      const r = await exportCsv(get("PNP", `/api/mi/export?type=${type}&stage=PEV`), undefined);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("text/csv");
      expect(r.headers.get("content-disposition")).toContain(`mi-${type}-`);
    }
    expect((await exportCsv(get("PNP", "/api/mi/export?type=nope"), undefined)).status).toBe(400);
    expect((await chase(post("PNP", {}), undefined)).status).toBe(400);
    expect((await support(post("PNP", { journeyId: "missing" }), undefined)).status).toBe(404);
  });
});
