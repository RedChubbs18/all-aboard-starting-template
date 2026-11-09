import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Proof that a photo reference passed the check for a given journey, so the submit step cannot be
 * called without a pass. Stateless: the image itself is never stored (FR-1.9), only this opaque
 * reference and an HMAC over it.
 */
const fallbackSecret = randomBytes(32).toString("hex");
const secret = () => process.env.PHOTO_REF_SECRET || process.env.DEMO_SESSION_SECRET || fallbackSecret;

const mac = (journeyId: string, photoRef: string) => createHmac("sha256", secret()).update(`${journeyId}|${photoRef}|pass`).digest("hex");

export const newPhotoRef = () => `PH-${randomBytes(9).toString("hex")}`;

export const signPhotoRef = (journeyId: string, photoRef: string) => mac(journeyId, photoRef);

export function verifyPhotoRef(journeyId: string, photoRef: string, token: string): boolean {
  const a = Buffer.from(mac(journeyId, photoRef));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
