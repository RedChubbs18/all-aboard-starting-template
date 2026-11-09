import { createHmac } from "node:crypto";

/** Signature scheme from docs/DEMO-WORKDAY.md: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>">. */
export function sign(secret: string, timestamp: string, rawBody: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function signedHeaders(secret: string, rawBody: string, now: Date = new Date()): Record<string, string> {
  const ts = String(Math.floor(now.getTime() / 1000));
  return { "x-workday-timestamp": ts, "x-workday-signature": sign(secret, ts, rawBody) };
}

/** The integration is enabled only with a 32+ character secret (matches MyJourney). */
export function webhookSecret(): string | null {
  const s = process.env.WORKDAY_WEBHOOK_SECRET ?? "";
  return s.length >= 32 ? s : null;
}
