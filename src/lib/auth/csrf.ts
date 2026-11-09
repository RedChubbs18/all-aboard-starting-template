/**
 * CSRF guard for state-changing API calls (L5). The demo session is a cookie, so a page on another origin
 * (including another port on localhost, which is "same-site" for SameSite=Lax) could otherwise post to us.
 *
 * For any method other than GET/HEAD/OPTIONS:
 *  - `Origin`, when present, must match the request host (Host, the URL host or X-Forwarded-Host, so a
 *    dev tunnel that rewrites Host still works). Browsers always send Origin on cross-origin POSTs.
 *  - A body must be `application/json` (or `multipart/form-data` when the route opts in). Cross-site HTML
 *    forms can only send urlencoded, multipart or text/plain, and JSON from another origin needs a CORS
 *    preflight we never grant. Body-less requests (e.g. "mark read", logout) need no content type.
 */
export interface CsrfOptions {
  /** Accept multipart/form-data bodies (photo upload). */
  allowMultipart?: boolean;
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

function requestHosts(req: Request): Set<string> {
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(req.url).host.toLowerCase());
  } catch {
    /* relative URL: ignore */
  }
  const host = req.headers.get("host");
  if (host) hosts.add(host.trim().toLowerCase());
  for (const h of (req.headers.get("x-forwarded-host") ?? "").split(",")) if (h.trim()) hosts.add(h.trim().toLowerCase());
  return hosts;
}

function hasBody(req: Request): boolean {
  const cl = req.headers.get("content-length");
  if (cl !== null) return Number(cl) > 0;
  if (req.headers.get("transfer-encoding")) return true;
  return req.body !== null;
}

/** Returns an error Response when the request fails the check, otherwise null. */
export function csrfCheck(req: Request, opts: CsrfOptions = {}): Response | null {
  if (SAFE.has(req.method.toUpperCase())) return null;
  const origin = req.headers.get("origin");
  if (origin !== null) {
    let originHost: string | null = null;
    try {
      originHost = origin === "null" ? null : new URL(origin).host.toLowerCase();
    } catch {
      originHost = null;
    }
    if (!originHost || !requestHosts(req).has(originHost)) {
      return Response.json({ error: "csrf_failed", message: "Cross-origin request blocked" }, { status: 403 });
    }
  }
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const allowed = type === "application/json" || (opts.allowMultipart === true && type === "multipart/form-data");
  if (type ? !allowed : hasBody(req)) {
    return Response.json(
      { error: "unsupported_media_type", message: opts.allowMultipart ? "Send JSON or multipart form data" : "Send JSON (content-type: application/json)" },
      { status: 415 },
    );
  }
  return null;
}
