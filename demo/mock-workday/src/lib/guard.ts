import { timingSafeEqual } from "node:crypto";

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

// ---------------------------------------------------------------- recruiter access (no sign-in)

/** True for localhost, 127.x.x.x and ::1 (with or without a port). */
export function isLoopbackHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader) return false;
  let h: string;
  try {
    h = new URL(`http://${hostHeader.trim()}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  h = h.replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}

const isLoopbackIp = (ip: string): boolean => /^(::1|(::ffff:)?127(\.\d{1,3}){3})$/i.test(ip.replace(/^\[|\]$/g, ""));

/**
 * The request counts as local only when the Host header is loopback and no proxy header points elsewhere
 * (a tunnel or reverse proxy adds x-forwarded-* / forwarded). This defeats DNS rebinding and tunnels.
 * It is not a defence against a LAN peer who forges the Host header: set RECRUITER_PIN whenever the app
 * listens beyond this machine.
 */
export function isLocalRequest(req: Request): boolean {
  const host = req.headers.get("host") ?? (() => { try { return new URL(req.url).host; } catch { return ""; } })();
  if (!isLoopbackHost(host)) return false;
  const fwdHost = req.headers.get("x-forwarded-host");
  if (fwdHost && !isLoopbackHost(fwdHost.split(",")[0])) return false;
  const fwdFor = req.headers.get("x-forwarded-for");
  if (fwdFor && !fwdFor.split(",").every((ip) => isLoopbackIp(ip.trim()))) return false;
  if (req.headers.get("forwarded")) return false;
  return true;
}

function pinMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Recruiter access rule. Local requests pass (and must match RECRUITER_PIN too, if one is set and the PIN header
 * is sent wrong). Any non-local request needs RECRUITER_PIN to be set and sent in x-recruiter-pin; with no PIN
 * configured it fails closed.
 */
export function recruiterAccess(req: Request): Response | null {
  const pin = process.env.RECRUITER_PIN ?? "";
  const given = req.headers.get("x-recruiter-pin") ?? "";
  if (isLocalRequest(req)) {
    if (given && pin && !pinMatches(given, pin)) return denied("bad_pin");
    return null;
  }
  if (!pin) return Response.json({ error: "forbidden", message: "The recruiter console is limited to this computer. Set RECRUITER_PIN to allow other hosts." }, { status: 403 });
  if (!given) return denied("pin_required");
  if (!rateLimit(`pin:${clientIp(req)}`, 10, 60_000)) return tooMany();
  return pinMatches(given, pin) ? null : denied("bad_pin");
}

const denied = (code: "pin_required" | "bad_pin") =>
  Response.json({ error: code, message: code === "pin_required" ? "Enter the recruiter PIN." : "That PIN is not correct." }, { status: 403 });

/** Wraps a recruiter route: CSRF check, loopback/PIN rule, JSON errors. */
export function recruiterRoute<C = unknown>(handler: (req: Request, ctx: C) => Promise<Response> | Response) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const csrf = csrfCheck(req);
    if (csrf) return csrf;
    const access = recruiterAccess(req);
    if (access) return access;
    try {
      return await handler(req, ctx);
    } catch (e) {
      console.error("[recruiter api]", e instanceof Error ? e.name : "error");
      return Response.json({ error: "server_error" }, { status: 500 });
    }
  };
}
