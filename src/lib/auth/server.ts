/**
 * Server-side auth. Two mutually exclusive modes, chosen by AUTH_MODE:
 *  - "demo": signed httpOnly cookie set by the persona switcher. Active ONLY when AUTH_MODE === "demo".
 *  - anything else (default): Entra ID. `Authorization: Bearer <id/access token>` validated with jose
 *    against the tenant JWKS (issuer + audience + tid), then `oid` mapped to a User row.
 * Roles always come from the database (User.roles), never from the token.
 */
import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { prisma } from "@/server/db";
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
const DEMO_PLACEHOLDER = "dev-only-change-me-dev-only-change-me";

export type AuthMode = "demo" | "entra";
/** Demo mode never activates unless the variable is explicitly "demo". */
export const authMode = (): AuthMode => (process.env.AUTH_MODE === "demo" ? "demo" : "entra");

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

function demoSecret(): Uint8Array {
  const s = process.env.DEMO_SESSION_SECRET ?? "";
  if (s.length < 16) throw new Error("DEMO_SESSION_SECRET must be set (16+ chars) when AUTH_MODE=demo");
  if (process.env.NODE_ENV === "production" && s === DEMO_PLACEHOLDER) {
    throw new Error("DEMO_SESSION_SECRET is still the .env.example placeholder");
  }
  return new TextEncoder().encode(s);
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
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("DEMO_SESSION_SECRET")) throw e;
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
 */
export function withRole<C = unknown>(roles: Role[], handler: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
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
