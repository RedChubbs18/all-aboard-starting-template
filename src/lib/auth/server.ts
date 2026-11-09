/**
 * Server-side auth. Two mutually exclusive modes, chosen by AUTH_MODE:
 *  - "demo": signed httpOnly cookie set by the persona switcher. Active ONLY when AUTH_MODE === "demo".
 *  - anything else (default): Entra ID. `Authorization: Bearer <id/access token>` validated with jose
 *    against the tenant JWKS (issuer + audience + tid), then `oid` mapped to a User row.
 * Roles always come from the database (User.roles), never from the token.
 */
import { randomBytes } from "node:crypto";
import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { prisma } from "@/server/db";
import { csrfCheck, type CsrfOptions } from "./csrf";
import { parseRoles, hasAnyRole, type Role, type SessionUser } from "./roles";

export class AuthError extends Error {
  constructor(
    public status: 401 | 403,
    public code: "unauthenticated" | "invalid_token" | "not_onboarded" | "forbidden",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const DEMO_COOKIE = "demo_session";

export type AuthMode = "demo" | "entra";

const g = globalThis as unknown as { __demoSecret?: Uint8Array; __demoWarned?: Set<string> };
function warnOnce(key: string, msg: string) {
  g.__demoWarned ??= new Set();
  if (g.__demoWarned.has(key)) return;
  g.__demoWarned.add(key);
  console.warn(msg);
}

/**
 * Demo mode never activates unless the variable is explicitly "demo". It makes every persona, including ADMIN,
 * one click away, so production builds (`next start`) refuse it unless ALLOW_DEMO_MODE=1 is also set.
 */
export const authMode = (): AuthMode => {
  if (process.env.AUTH_MODE !== "demo") return "entra";
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_MODE !== "1") {
    warnOnce("prod", "[auth] AUTH_MODE=demo is ignored in production. Set ALLOW_DEMO_MODE=1 to allow it (local demos only).");
    return "entra";
  }
  return "demo";
};

// -------------------------------------------------------------------- Entra

export interface EntraVerifyOptions {
  tenantId: string;
  clientId: string;
  /** Override for tests. */
  keys?: JWTVerifyGetKey | Parameters<typeof jwtVerify>[1];
}

let jwksCache: { tenant: string; keys: JWTVerifyGetKey } | null = null;
function tenantJwks(tenantId: string): JWTVerifyGetKey {
  if (jwksCache?.tenant !== tenantId) {
    jwksCache = {
      tenant: tenantId,
      keys: createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)),
    };
  }
  return jwksCache.keys;
}

export const entraIssuer = (tenantId: string) => `https://login.microsoftonline.com/${tenantId}/v2.0`;

/** Verifies signature (RS256), issuer, audience (client id or api://client id), expiry and tid. */
export async function verifyEntraToken(token: string, o: EntraVerifyOptions): Promise<JWTPayload & { oid: string }> {
  try {
    const keys = (o.keys ?? tenantJwks(o.tenantId)) as JWTVerifyGetKey;
    const { payload } = await jwtVerify(token, keys, {
      issuer: entraIssuer(o.tenantId),
      audience: [o.clientId, `api://${o.clientId}`],
      algorithms: ["RS256"],
    });
    if (payload.tid !== o.tenantId) throw new Error("tid mismatch");
    if (typeof payload.oid !== "string" || !payload.oid) throw new Error("missing oid");
    return payload as JWTPayload & { oid: string };
  } catch {
    throw new AuthError(401, "invalid_token", "Invalid or expired token");
  }
}

// --------------------------------------------------------------------- demo

/** The old `.env.example` value and anything like it is public, so it is never used as a key. */
export const isPlaceholderSecret = (s: string) => /change[-_ ]?me/i.test(s);

/**
 * DEMO_SESSION_SECRET when it is set, 16+ chars and not a placeholder (in every environment). Otherwise a random
 * per-process key (kept across dev hot reloads): demo sessions then reset when the server restarts.
 */
function demoSecret(): Uint8Array {
  const s = process.env.DEMO_SESSION_SECRET ?? "";
  if (s.length >= 16 && !isPlaceholderSecret(s)) return new TextEncoder().encode(s);
  if (!g.__demoSecret) {
    g.__demoSecret = new Uint8Array(randomBytes(32));
    warnOnce("secret", "[auth] DEMO_SESSION_SECRET is missing, short or a placeholder; using a random per-process key (demo sessions reset on restart).");
  }
  return g.__demoSecret;
}

export async function signDemoSession(userId: string): Promise<string> {
  if (authMode() !== "demo") throw new Error("Demo mode is not enabled");
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("8h").sign(demoSecret());
}

async function verifyDemoSession(token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, demoSecret(), { algorithms: ["HS256"] });
    if (!payload.sub) throw new Error("no sub");
    return payload.sub;
  } catch {
    throw new AuthError(401, "invalid_token", "Invalid demo session");
  }
}

export const demoCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 8 * 60 * 60,
});

function readCookie(req: Request, name: string): string | null {
  const h = req.headers.get("cookie");
  if (!h) return null;
  for (const part of h.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// ------------------------------------------------------------------ session

const toSessionUser = (u: { id: string; displayName: string; upn: string; roles: unknown; teamId: string | null }): SessionUser => ({
  id: u.id,
  displayName: u.displayName,
  upn: u.upn,
  roles: parseRoles(u.roles),
  teamId: u.teamId,
});

/** Resolves the caller or throws AuthError (401 unauthenticated/invalid, 403 not_onboarded). */
export async function getSessionUser(req: Request): Promise<SessionUser> {
  if (authMode() === "demo") {
    const c = readCookie(req, DEMO_COOKIE);
    if (!c) throw new AuthError(401, "unauthenticated");
    const id = await verifyDemoSession(c);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new AuthError(401, "invalid_token", "Unknown demo user");
    return toSessionUser(user);
  }
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) throw new AuthError(401, "unauthenticated");
  const tenantId = process.env.NEXT_PUBLIC_ENTRA_TENANT_ID;
  const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID;
  if (!tenantId || !clientId) throw new Error("NEXT_PUBLIC_ENTRA_TENANT_ID and NEXT_PUBLIC_ENTRA_CLIENT_ID must be set");
  const claims = await verifyEntraToken(m[1], { tenantId, clientId });
  const user = await prisma.user.findUnique({ where: { entraOid: claims.oid } });
  if (!user) throw new AuthError(403, "not_onboarded", "No onboarding record for this account yet");
  return toSessionUser(user);
}

/** Throws AuthError unless the caller holds at least one of `roles`. */
export async function requireRole(req: Request, ...roles: Role[]): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (roles.length && !hasAnyRole(user, ...roles)) throw new AuthError(403, "forbidden", "Insufficient role");
  return user;
}

export function authErrorResponse(e: unknown): Response | null {
  if (e instanceof AuthError) return Response.json({ error: e.code, message: e.message }, { status: e.status });
  return null;
}

type Handler<C> = (req: Request, ctx: C, user: SessionUser) => Promise<Response> | Response;

/**
 * Route handler wrapper: `export const GET = withRole(["LM","PNP"], async (req, ctx, user) => ...)`.
 * Converts AuthError to JSON 401/403. Every API route must use this (or requireRole).
 * Non-GET requests also pass the CSRF check in `./csrf` (same-origin Origin, JSON body; multipart only
 * when `opts.allowMultipart`).
 */
export function withRole<C = unknown>(roles: Role[], handler: Handler<C>, opts: CsrfOptions = {}) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const csrf = csrfCheck(req, opts);
    if (csrf) return csrf;
    try {
      const user = await requireRole(req, ...roles);
      return await handler(req, ctx, user);
    } catch (e) {
      const r = authErrorResponse(e);
      if (r) return r;
      console.error(e);
      return Response.json({ error: "server_error" }, { status: 500 });
    }
  };
}
