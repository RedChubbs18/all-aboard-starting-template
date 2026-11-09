import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

// ---------------------------------------------------------------- CSRF

/** Non-GET requests need a same-origin Origin header (when present) and a JSON body. */
export function csrfCheck(req: Request): Response | null {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return null;
  const origin = req.headers.get("origin");
  if (!origin) return Response.json({ error: "bad_origin" }, { status: 403 });
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(req.url).host.toLowerCase());
  } catch {}
  const h = req.headers.get("host");
  if (h) hosts.add(h.trim().toLowerCase());
  let originHost = "";
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {}
  if (!hosts.has(originHost)) return Response.json({ error: "bad_origin" }, { status: 403 });
  const cl = req.headers.get("content-length");
  const hasBody = cl !== null ? Number(cl) > 0 : req.body !== null;
  if (hasBody && !(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "unsupported_media_type" }, { status: 415 });
  }
  return null;
}

// ---------------------------------------------------------------- rate limit

const buckets = new Map<string, number[]>();

/** Sliding window, in memory. Returns true when the call is allowed. */
export function rateLimit(key: string, max: number, windowMs: number, now: number = Date.now()): boolean {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  return true;
}

export const clientIp = (req: Request): string => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";

export const tooMany = () => Response.json({ error: "rate_limited", message: "Too many requests. Please wait a moment." }, { status: 429 });

// ---------------------------------------------------------------- Entra (copied from MyJourney src/lib/auth/server.ts)

export class AuthError extends Error {
  constructor(public status: 401 | 403, public code: string, message?: string) {
    super(message ?? code);
  }
}

let jwksCache: { tenant: string; keys: JWTVerifyGetKey } | null = null;
function tenantJwks(tenantId: string): JWTVerifyGetKey {
  if (jwksCache?.tenant !== tenantId) {
    jwksCache = { tenant: tenantId, keys: createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)) };
  }
  return jwksCache.keys;
}

export interface EntraVerifyOptions {
  tenantId: string;
  clientId: string;
  keys?: JWTVerifyGetKey;
}

/** Verifies signature (RS256), issuer, audience, expiry and tid. */
export async function verifyEntraToken(token: string, o: EntraVerifyOptions): Promise<JWTPayload & { oid: string }> {
  try {
    const { payload } = await jwtVerify(token, o.keys ?? tenantJwks(o.tenantId), {
      issuer: `https://login.microsoftonline.com/${o.tenantId}/v2.0`,
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

/** Any signed-in member of the hackathon tenant acts as the recruiter. */
export async function requireRecruiter(req: Request): Promise<{ oid: string }> {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) throw new AuthError(401, "unauthenticated");
  const tenantId = process.env.NEXT_PUBLIC_ENTRA_TENANT_ID;
  const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID;
  if (!tenantId || !clientId) throw new Error("NEXT_PUBLIC_ENTRA_TENANT_ID and NEXT_PUBLIC_ENTRA_CLIENT_ID must be set");
  const claims = await verifyEntraToken(m[1], { tenantId, clientId });
  return { oid: claims.oid };
}

/** Wraps a recruiter route: CSRF check, Entra auth, JSON errors. */
export function recruiterRoute<C = unknown>(handler: (req: Request, ctx: C) => Promise<Response> | Response) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const csrf = csrfCheck(req);
    if (csrf) return csrf;
    try {
      await requireRecruiter(req);
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof AuthError) return Response.json({ error: e.code, message: e.message }, { status: e.status });
      console.error("[recruiter api]", e instanceof Error ? e.message : "error");
      return Response.json({ error: "server_error" }, { status: 500 });
    }
  };
}
