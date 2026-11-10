import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { seedDatabase } from "@/server/seed";
import { DEMO_COOKIE, signDemoSession } from "@/lib/auth/server";
import { GET as overview } from "./overview/route";
import { GET as journeys } from "./journeys/route";
import { GET as exportCsv } from "./export/route";
import { POST as chase } from "./chase/route";
import { POST as support } from "./support/route";
import { EXPORT_TYPES } from "@/server/mi-csv";

const ROLE_USERS = ["STARTER", "BUDDY", "LM", "PNP", "ADMIN"] as const;
let cookies: Record<string, string>;

beforeAll(async () => {
  await seedDatabase(prisma); // the real synthetic history, so the D36 sections have data
  process.env.AUTH_MODE = "demo";
  cookies = {};
  for (const r of ROLE_USERS) {
    const id = `mir-${r.toLowerCase()}`;
    await prisma.user.upsert({ where: { id }, update: { roles: [r] }, create: { id, upn: `${id}@example.test`, displayName: id, roles: [r] } });
    cookies[r] = `${DEMO_COOKIE}=${await signDemoSession(id)}`;
  }
}, 60_000);
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
    for (const type of EXPORT_TYPES) expect((await exportCsv(get(role, `/api/mi/export?type=${type}`), undefined)).status).toBe(403);
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
    for (const type of EXPORT_TYPES) {
      const r = await exportCsv(get("PNP", `/api/mi/export?type=${type}&stage=PEV`), undefined);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("text/csv");
      expect(r.headers.get("content-disposition")).toContain(`mi-${type}-`);
    }
    expect((await exportCsv(get("PNP", "/api/mi/export?type=nope"), undefined)).status).toBe(400);
    expect((await chase(post("PNP", {}), undefined)).status).toBe(400);
    expect((await support(post("PNP", { journeyId: "missing" }), undefined)).status).toBe(404);
  });

  it("returns the D36 sections in the overview and honours filters consistently", async () => {
    const body = await (await overview(get("PNP"), undefined)).json();
    expect(body.lm.league.length).toBeGreaterThan(0);
    expect(body.lm.flags.length).toBeGreaterThan(0);
    expect(body.lm.byTeam.length).toBeGreaterThan(0);
    expect(body.lm.byArea.length).toBeGreaterThan(0);
    expect(body.attrition.exits).toBeGreaterThan(0);
    expect(body.attrition.byStage).toHaveLength(5);
    expect(body.attrition.earlyWarning.length).toBeGreaterThan(0);
    expect(body.flow.tasks.length).toBeLessThanOrEqual(10);
    expect(body.flow.vetting.cleared).toBeGreaterThan(0);
    expect(body.intake.weeks).toHaveLength(13);
    expect(body.funnel[1]).toHaveProperty("p90Days");
    expect(body.kpis.majorFlags).toBe(body.lm.flags.length);
    const team = body.options.teams[0].id;
    const filtered = await (await overview(get("PNP", `/api/mi/overview?team=${team}`), undefined)).json();
    expect(filtered.lm.league.every((l: { teams: string[] }) => l.teams.length <= 1)).toBe(true);
    expect(filtered.attrition.starters).toBeLessThan(body.attrition.starters);
    // The status filter narrows the starters table but not the rates.
    const exitedOnly = await (await overview(get("PNP", "/api/mi/overview?status=exited"), undefined)).json();
    expect(exitedOnly.journeys.every((j: { status: string }) => j.status === "exited")).toBe(true);
    expect(exitedOnly.attrition.starters).toBe(body.attrition.starters);
    expect(exitedOnly.lm.league.length).toBe(body.lm.league.length);
  });

  it("exports the section CSVs with the section headers", async () => {
    const head = async (type: string) => (await (await exportCsv(get("PNP", `/api/mi/export?type=${type}`), undefined)).text()).split("\r\n")[0];
    expect(await head("lm-league")).toContain("Overdue LM actions");
    expect(await head("lm-flags")).toContain("Rules");
    expect(await head("attrition")).toBe("Breakdown,Group,Exits,Base,Rate (%)");
    expect(await head("early-warning")).toContain("Signals");
    expect(await head("bottlenecks")).toContain("Overdue now");
    expect(await head("vetting")).toBe("Measure,Value");
    expect(await head("intake")).toContain("Readiness (%)");
    expect(await head("funnel")).toContain("90th percentile");
  });
});
