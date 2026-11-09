import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from "jose";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { AuthError, authMode, getSessionUser, requireRole, signDemoSession, verifyEntraToken, withRole, DEMO_COOKIE } from "./server";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";
let sign: (claims?: Record<string, unknown>, o?: { iss?: string; aud?: string; exp?: string }) => Promise<string>;
let keys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1" }] });
  sign = (claims = {}, o = {}) =>
    new SignJWT({ oid: "oid-1", tid: TENANT, ...claims })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(o.iss ?? `https://login.microsoftonline.com/${TENANT}/v2.0`)
      .setAudience(o.aud ?? CLIENT)
      .setIssuedAt()
      .setExpirationTime(o.exp ?? "5m")
      .sign(privateKey);
  await prisma.user.upsert({ where: { id: "auth-u1" }, update: { entraOid: "oid-1", roles: ["LM"] }, create: { id: "auth-u1", upn: "auth.u1@example.test", displayName: "Auth U1", entraOid: "oid-1", roles: ["LM"] } });
});
afterEach(() => {
  delete process.env.AUTH_MODE;
  delete process.env.NEXT_PUBLIC_ENTRA_TENANT_ID;
  delete process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID;
});

const opts = () => ({ tenantId: TENANT, clientId: CLIENT, keys });

describe("verifyEntraToken", () => {
  it("accepts a valid token", async () => {
    expect((await verifyEntraToken(await sign(), opts())).oid).toBe("oid-1");
  });
  it("accepts api:// audience", async () => {
    await expect(verifyEntraToken(await sign({}, { aud: `api://${CLIENT}` }), opts())).resolves.toBeTruthy();
  });
  it("rejects wrong audience, issuer, tenant, expiry and garbage", async () => {
    for (const t of [
      await sign({}, { aud: "someone-else" }),
      await sign({}, { iss: "https://login.microsoftonline.com/other/v2.0" }),
      await sign({ tid: "other" }),
      await sign({ oid: undefined }),
      await sign({}, { exp: "-1m" }),
      "not.a.jwt",
    ]) {
      await expect(verifyEntraToken(t, opts())).rejects.toBeInstanceOf(AuthError);
    }
  });
  it("rejects a token signed by a different key", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ oid: "oid-1", tid: TENANT }).setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(`https://login.microsoftonline.com/${TENANT}/v2.0`).setAudience(CLIENT).setExpirationTime("5m").sign(other.privateKey);
    await expect(verifyEntraToken(forged, opts())).rejects.toBeInstanceOf(AuthError);
  });
});

describe("demo mode", () => {
  it("is never active unless AUTH_MODE is exactly 'demo'", async () => {
    for (const v of [undefined, "", "DEMO", "true", "demo ", "1"]) {
      if (v === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = v;
      expect(authMode()).toBe("entra");
    }
    await expect(signDemoSession("auth-u1")).rejects.toThrow(/not enabled/);
  });
  it("does not honour a demo cookie when not in demo mode", async () => {
    process.env.AUTH_MODE = "demo";
    process.env.DEMO_SESSION_SECRET = "test-secret-test-secret-test-secret";
    const c = await signDemoSession("auth-u1");
    delete process.env.AUTH_MODE;
    await expect(getSessionUser(new Request("http://x/api", { headers: { cookie: `${DEMO_COOKIE}=${c}` } }))).rejects.toMatchObject({ status: 401 });
  });
  it("resolves the persona and enforces roles", async () => {
    process.env.AUTH_MODE = "demo";
    const c = await signDemoSession("auth-u1");
    const req = (cookie: string) => new Request("http://x/api", { headers: { cookie: `a=b; ${DEMO_COOKIE}=${cookie}` } });
    expect((await getSessionUser(req(c))).roles).toEqual(["LM"]);
    await expect(requireRole(req(c), "ADMIN")).rejects.toMatchObject({ status: 403, code: "forbidden" });
    await expect(getSessionUser(req(c + "x"))).rejects.toMatchObject({ status: 401 });
    await expect(getSessionUser(new Request("http://x/api"))).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
  });
  it("withRole maps AuthError to JSON status codes", async () => {
    process.env.AUTH_MODE = "demo";
    const h = withRole(["PNP"], () => Response.json({ ok: true }));
    expect((await h(new Request("http://x/api"), {})).status).toBe(401);
    const c = await signDemoSession("auth-u1");
    expect((await h(new Request("http://x/api", { headers: { cookie: `${DEMO_COOKIE}=${c}` } }), {})).status).toBe(403);
  });
});

describe("entra mode user mapping", () => {
  it("returns 401 without a bearer token", async () => {
    process.env.NEXT_PUBLIC_ENTRA_TENANT_ID = TENANT;
    process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID = CLIENT;
    await expect(getSessionUser(new Request("http://x/api"))).rejects.toMatchObject({ status: 401 });
    await expect(getSessionUser(new Request("http://x/api", { headers: { authorization: "Bearer junk" } }))).rejects.toMatchObject({ code: "invalid_token" });
  });
});
