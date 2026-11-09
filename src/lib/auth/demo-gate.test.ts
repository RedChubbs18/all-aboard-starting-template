/**
 * H1: demo mode off this computer needs DEMO_PIN; production refuses demo mode; the placeholder session
 * secret is never used. L5: one CSRF check in withRole and the demo login route.
 */
import { SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { GET as personasGET } from "@/app/api/demo/personas/route";
import { POST as loginPOST } from "@/app/api/demo/login/route";
import { POST as logoutPOST } from "@/app/api/demo/logout/route";
import { GET as configGET } from "@/app/api/auth/config/route";
import { DEMO_COOKIE, authMode, getSessionUser, signDemoSession, withRole } from "./server";
import { isLoopbackRequest, pinMatches, resetDemoPinFailures } from "./demo-gate";

const USER = "gate-u1";
const LAN = "http://192.168.1.50:3000";
const env = { ...process.env };

const login = (base: string, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  loginPOST(new Request(`${base}/api/demo/login`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

beforeAll(async () => {
  await prisma.user.upsert({ where: { id: USER }, update: { roles: ["ADMIN"] }, create: { id: USER, upn: "gate.u1@example.test", displayName: "Gate U1", roles: ["ADMIN"] } });
});
beforeEach(() => {
  process.env.AUTH_MODE = "demo";
  // Prisma loads a local .env into process.env, which may set these.
  delete process.env.ALLOWED_DEV_ORIGINS;
  delete process.env.DEMO_PIN;
  resetDemoPinFailures();
});
afterEach(() => {
  for (const k of ["AUTH_MODE", "DEMO_PIN", "ALLOWED_DEV_ORIGINS", "ALLOW_DEMO_MODE", "DEMO_SESSION_SECRET"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  vi.unstubAllEnvs();
});

describe("loopback detection", () => {
  it("treats localhost, 127.0.0.1 and ::1 as local, everything else as remote", () => {
    for (const u of ["http://localhost:3000/x", "http://127.0.0.1:3000/x", "http://[::1]:3000/x"]) expect(isLoopbackRequest(new Request(u)), u).toBe(true);
    expect(isLoopbackRequest(new Request(`${LAN}/x`))).toBe(false);
  });
  it("is not fooled by a loopback URL when other host signals point elsewhere", () => {
    const r = (h: Record<string, string>) => new Request("http://localhost:3000/x", { headers: h });
    expect(isLoopbackRequest(r({ host: "192.168.1.50:3000" }))).toBe(false);
    expect(isLoopbackRequest(r({ "x-forwarded-host": "abc.devtunnels.ms" }))).toBe(false);
    expect(isLoopbackRequest(r({ "x-forwarded-for": "192.168.1.77" }))).toBe(false);
    expect(isLoopbackRequest(r({ origin: "https://abc.devtunnels.ms" }))).toBe(false);
    expect(isLoopbackRequest(r({ host: "localhost:3000", "x-forwarded-for": "::1", origin: "http://localhost:3000" }))).toBe(true);
  });
  it("trusts nothing as loopback when LAN mode (ALLOWED_DEV_ORIGINS) and DEMO_PIN are both set", () => {
    process.env.ALLOWED_DEV_ORIGINS = "192.168.1.50";
    expect(isLoopbackRequest(new Request("http://localhost:3000/x"))).toBe(true);
    process.env.DEMO_PIN = "482916";
    expect(isLoopbackRequest(new Request("http://localhost:3000/x"))).toBe(false);
  });
  it("compares PINs exactly", () => {
    expect(pinMatches("123456", "123456")).toBe(true);
    expect(pinMatches("12345", "123456")).toBe(false);
    expect(pinMatches(null, "123456")).toBe(false);
    expect(pinMatches("", "")).toBe(false);
  });
});

describe("demo endpoints from another device (H1)", () => {
  it("loopback: personas and login work without a PIN", async () => {
    expect((await personasGET(new Request("http://localhost:3000/api/demo/personas"))).status).toBe(200);
    expect((await login("http://localhost:3000", { userId: USER })).status).toBe(200);
    expect(await (await configGET(new Request("http://localhost:3000/api/auth/config"))).json()).toEqual({ mode: "demo", demoPinRequired: false });
  });

  it("non-loopback without DEMO_PIN: personas, login and logout are 403", async () => {
    delete process.env.DEMO_PIN;
    expect((await personasGET(new Request(`${LAN}/api/demo/personas`))).status).toBe(403);
    const r = await login(LAN, { userId: USER });
    expect(r.status).toBe(403);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect((await login(LAN, { userId: USER, pin: "anything" })).status).toBe(403);
    expect((await logoutPOST(new Request(`${LAN}/api/demo/logout`, { method: "POST" }))).status).toBe(403);
  });

  it("non-loopback with DEMO_PIN: login needs the right PIN (JSON field or x-demo-pin header)", async () => {
    process.env.DEMO_PIN = "482916";
    expect(await (await configGET(new Request(`${LAN}/api/auth/config`))).json()).toEqual({ mode: "demo", demoPinRequired: true });
    expect((await personasGET(new Request(`${LAN}/api/demo/personas`))).status).toBe(200);
    expect((await login(LAN, { userId: USER })).status).toBe(403);
    expect((await login(LAN, { userId: USER, pin: "000000" })).status).toBe(403);
    const ok = await login(LAN, { userId: USER, pin: "482916" });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toContain(DEMO_COOKIE);
    expect((await login(LAN, { userId: USER }, { "x-demo-pin": "482916" })).status).toBe(200);
    expect((await logoutPOST(new Request(`${LAN}/api/demo/logout`, { method: "POST" }))).status).toBe(200);
  });

  it("pauses PIN sign-in after repeated wrong PINs, even for the right PIN", async () => {
    process.env.DEMO_PIN = "482916";
    for (let i = 0; i < 10; i++) expect((await login(LAN, { userId: USER, pin: `bad-${i}` })).status).toBe(403);
    expect((await login(LAN, { userId: USER, pin: "bad-x" })).status).toBe(429);
    expect((await login(LAN, { userId: USER, pin: "482916" })).status).toBe(429);
    expect((await login("http://localhost:3000", { userId: USER })).status).toBe(200); // the host laptop is unaffected
  });
});

describe("production and secrets (H1)", () => {
  it("refuses demo mode in production unless ALLOW_DEMO_MODE=1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(authMode()).toBe("entra");
    expect((await personasGET(new Request("http://localhost:3000/api/demo/personas"))).status).toBe(404);
    expect((await login("http://localhost:3000", { userId: USER })).status).toBe(404);
    process.env.ALLOW_DEMO_MODE = "true";
    expect(authMode()).toBe("entra");
    process.env.ALLOW_DEMO_MODE = "1";
    expect(authMode()).toBe("demo");
    warn.mockRestore();
  });

  it("never accepts a session signed with the placeholder secret", async () => {
    const placeholder = "dev-only-change-me-dev-only-change-me";
    process.env.DEMO_SESSION_SECRET = placeholder;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const forged = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(USER).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(placeholder));
    const req = (c: string) => new Request("http://localhost/api", { headers: { cookie: `${DEMO_COOKIE}=${c}` } });
    await expect(getSessionUser(req(forged))).rejects.toMatchObject({ status: 401 });
    // A session issued by the server (random per-process key) still works.
    expect((await getSessionUser(req(await signDemoSession(USER)))).id).toBe(USER);
    delete process.env.DEMO_SESSION_SECRET;
    expect((await getSessionUser(req(await signDemoSession(USER)))).id).toBe(USER);
    warn.mockRestore();
  });
});

describe("CSRF check (L5)", () => {
  const h = withRole(["ADMIN"], () => Response.json({ ok: true }));
  const send = async (init: { method?: string; headers?: Record<string, string>; body?: BodyInit }, url = "http://localhost:3000/api/x") =>
    h(new Request(url, { method: init.method ?? "POST", headers: { cookie: `${DEMO_COOKIE}=${await signDemoSession(USER)}`, ...init.headers }, body: init.body }), {});

  it("allows same-origin JSON, body-less posts and GETs", async () => {
    expect((await send({ headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: "{}" })).status).toBe(200);
    expect((await send({ headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(200);
    expect((await send({})).status).toBe(200);
    expect((await send({ method: "DELETE" })).status).toBe(200);
    expect((await send({ method: "GET", headers: { origin: "http://evil.example" } })).status).toBe(200);
  });

  it("accepts a tunnel origin that matches X-Forwarded-Host", async () => {
    expect((await send({ headers: { "content-type": "application/json", origin: "https://abc.devtunnels.ms", "x-forwarded-host": "abc.devtunnels.ms" }, body: "{}" })).status).toBe(200);
  });

  it("rejects a foreign or null Origin", async () => {
    for (const origin of ["http://evil.example", "http://localhost:3001", "null"]) {
      expect((await send({ headers: { "content-type": "application/json", origin }, body: "{}" })).status, origin).toBe(403);
    }
  });

  it("rejects form-style and text bodies (415), and multipart unless the route opts in", async () => {
    expect((await send({ headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a=b" })).status).toBe(415);
    expect((await send({ headers: { "content-type": "text/plain" }, body: "{}" })).status).toBe(415);
    expect((await send({ body: "{}" })).status).toBe(415); // string body defaults to text/plain
    expect((await send({ headers: { "content-type": "multipart/form-data; boundary=x" }, body: "--x--" })).status).toBe(415);
    const mp = withRole(["ADMIN"], () => Response.json({ ok: true }), { allowMultipart: true });
    const r = new Request("http://localhost:3000/api/x", {
      method: "POST",
      headers: { cookie: `${DEMO_COOKIE}=${await signDemoSession(USER)}`, "content-type": "multipart/form-data; boundary=x" },
      body: "--x--",
    });
    expect((await mp(r, {})).status).toBe(200);
  });

  it("demo login rejects cross-origin and non-JSON posts", async () => {
    expect((await login("http://localhost:3000", { userId: USER }, { origin: "http://evil.example" })).status).toBe(403);
    const form = await loginPOST(new Request("http://localhost:3000/api/demo/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `userId=${USER}` }));
    expect(form.status).toBe(415);
  });
});
