import { WorkdayError, takeWorkdayRateLimit, verifyWorkdaySignature, workdayErrorResponse, workdaySecret } from "@/server/workday-service";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Server-to-server guard for the mock Workday routes. These do NOT use withRole: there are no cookies or
 * bearer tokens, so the CSRF/Origin check does not apply. Authentication is the HMAC signature instead.
 * Order: disabled (404) -> rate limit -> JSON content type for bodies -> signature (401) -> handler.
 */
export async function workdayGuard(req: Request, requireJson: boolean, fn: (rawBody: string) => Promise<Response>): Promise<Response> {
  const secret = workdaySecret();
  if (!secret) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const limit = takeWorkdayRateLimit();
    if (!limit.ok) {
      return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
    }
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) throw new WorkdayError(413, "too_large", "Body too large");
    verifyWorkdaySignature(secret, req.headers, rawBody);
    if (requireJson && (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") {
      throw new WorkdayError(415, "unsupported_media_type", "Send JSON (content-type: application/json)");
    }
    return await fn(rawBody);
  } catch (e) {
    const r = workdayErrorResponse(e);
    if (r) return r;
    console.error(e);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
