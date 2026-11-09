/**
 * Who may use the demo persona endpoints (H1). Demo mode signs anyone in as anyone, ADMIN included, so:
 *  - Loopback requests (this laptop: localhost, 127.0.0.1, ::1) are allowed freely.
 *  - Any other host (phones on `npm run dev:lan`, a tunnel) needs DEMO_PIN to be set, and login must carry
 *    that PIN (`x-demo-pin` header or `pin` JSON field). Without DEMO_PIN they get 403.
 *
 * "Loopback" is judged from Host, the URL host, X-Forwarded-Host, X-Forwarded-For and Origin, all of which
 * must be loopback. Those headers are client-controlled, so a LAN client with curl could fake them. For that
 * reason, when both ALLOWED_DEV_ORIGINS (the LAN setup in docs/DEV.md) and DEMO_PIN are set, nothing is
 * treated as loopback and the PIN is needed on every device, this laptop included.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { createRateLimiter } from "@/server/rate-limit";

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "::ffff:127.0.0.1", "[::ffff:127.0.0.1]"]);

function hostname(hostOrUrl: string): string | null {
  const v = hostOrUrl.trim().toLowerCase();
  if (!v) return null;
  try {
    return new URL(v.includes("://") ? v : `http://${v}`).hostname;
  } catch {
    return null;
  }
}

const isLoopbackName = (h: string | null) => !!h && (LOOPBACK_NAMES.has(h) || /^127(\.\d{1,3}){3}$/.test(h) || h.endsWith(".localhost"));

const lanWithPin = () => !!(process.env.ALLOWED_DEV_ORIGINS ?? "").trim() && !!(process.env.DEMO_PIN ?? "").trim();

/** Every host signal on the request points at this machine (and LAN mode with a PIN is not configured). */
export function isLoopbackRequest(req: Request): boolean {
  if (lanWithPin()) return false;
  let urlHost: string | null = null;
  try {
    urlHost = new URL(req.url).hostname;
  } catch {
    return false;
  }
  if (!isLoopbackName(urlHost)) return false;
  const host = req.headers.get("host");
  if (host !== null && !isLoopbackName(hostname(host))) return false;
  for (const h of (req.headers.get("x-forwarded-host") ?? "").split(",").filter((x) => x.trim())) {
    if (!isLoopbackName(hostname(h))) return false;
  }
  for (const ip of (req.headers.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    if (!isLoopbackName(ip.toLowerCase())) return false;
  }
  const origin = req.headers.get("origin");
  if (origin !== null && !isLoopbackName(hostname(origin))) return false;
  return true;
}

const configuredPin = () => (process.env.DEMO_PIN ?? "").trim();

/** True when the persona switcher must ask for the PIN on this request. */
export const demoPinRequired = (req: Request) => !isLoopbackRequest(req);

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** Constant-time PIN comparison (hashing first makes the lengths equal). */
export function pinMatches(given: string | null | undefined, expected: string): boolean {
  if (!expected || typeof given !== "string") return false;
  return timingSafeEqual(digest(given.trim()), digest(expected));
}

/** Failed PIN attempts, counted globally (client IPs are not trustworthy here): 10 per 10 minutes. */
const pinFailures = createRateLimiter({ max: 10, windowMs: 10 * 60_000 });
export const resetDemoPinFailures = () => pinFailures.reset();

const forbidden = (error: string, message: string) => Response.json({ error, message }, { status: 403 });

/**
 * Gate for /api/demo/*. Returns an error Response, or null to continue.
 * `pin` is only checked when `requirePin` is set (the login route); other routes only need DEMO_PIN configured.
 */
export function demoGate(req: Request, opts: { requirePin?: boolean; pin?: string | null } = {}): Response | null {
  if (isLoopbackRequest(req)) return null;
  const expected = configuredPin();
  if (!expected) {
    return forbidden("demo_local_only", "Demo sign-in only works on the host computer. Set DEMO_PIN in .env to allow other devices.");
  }
  if (!opts.requirePin) return null;
  // Locked out after repeated failures, even for the right PIN, so guessing cannot continue.
  const locked = pinFailures.peek("global");
  if (!locked.ok) {
    return Response.json(
      { error: "rate_limited", message: "Too many wrong PINs. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(locked.retryAfterSec) } },
    );
  }
  const given = opts.pin ?? req.headers.get("x-demo-pin");
  if (pinMatches(given, expected)) return null;
  pinFailures.take("global");
  return forbidden("demo_pin_invalid", "Enter the demo PIN.");
}
