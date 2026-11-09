import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Proof that a photo reference passed the check for a given journey, so the submit step cannot be
 * called without a pass. Stateless: the image itself is never stored (FR-1.9), only this opaque
 * reference and an HMAC over it.
 *
 * Key: PHOTO_REF_SECRET only (32+ chars, not a placeholder, not reused from DEMO_SESSION_SECRET).
 * Otherwise a random per-process key, so tokens simply expire on restart. It never falls back to
 * DEMO_SESSION_SECRET (a known placeholder there would make tokens forgeable).
 */
const g = globalThis as unknown as { __photoRefSecret?: string; __photoRefWarned?: boolean };

const PLACEHOLDER = /change[-_ ]?me|placeholder|example|^(x+|0+)$/i;

/** True when `s` is usable as an HMAC key: long enough and not an obvious placeholder or reused secret. */
export function acceptablePhotoSecret(s: string | undefined): s is string {
  if (!s || s.length < 32 || PLACEHOLDER.test(s)) return false;
  if (process.env.DEMO_SESSION_SECRET && s === process.env.DEMO_SESSION_SECRET) return false;
  return true;
}

export function photoRefSecret(): string {
  const configured = process.env.PHOTO_REF_SECRET;
  if (acceptablePhotoSecret(configured)) return configured;
  if (configured && !g.__photoRefWarned) {
    g.__photoRefWarned = true;
    console.warn("[photo-token] PHOTO_REF_SECRET is too short or a placeholder; using a random per-process key");
  }
  g.__photoRefSecret ??= randomBytes(32).toString("hex");
  return g.__photoRefSecret;
}

const mac = (journeyId: string, photoRef: string) => createHmac("sha256", photoRefSecret()).update(`${journeyId}|${photoRef}|pass`).digest("hex");

export const newPhotoRef = () => `PH-${randomBytes(9).toString("hex")}`;

export const signPhotoRef = (journeyId: string, photoRef: string) => mac(journeyId, photoRef);

export function verifyPhotoRef(journeyId: string, photoRef: string, token: string): boolean {
  const a = Buffer.from(mac(journeyId, photoRef));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
