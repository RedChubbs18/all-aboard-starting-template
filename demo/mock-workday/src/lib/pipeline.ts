import { webhookSecret } from "./hmac";
import { buildWebhookPayload, sendOfferAccepted } from "./webhook";
import { getOfferById, markFailed, markOnboarded, type Offer } from "./store";

/** Calls the MyJourney webhook for an offer whose invite result is recorded. Secret stays server-side. */
export async function notifyMyJourney(offerId: string): Promise<Offer | null> {
  const offer = await getOfferById(offerId);
  if (!offer || !offer.candidate || !offer.inviteStatus) return offer;
  const secret = webhookSecret();
  if (!secret) return markFailed(offerId, "WORKDAY_WEBHOOK_SECRET is not set (32+ characters)");
  const payload = buildWebhookPayload(offer, { objectId: offer.guestObjectId ?? null, inviteStatus: offer.inviteStatus });
  const r = await sendOfferAccepted({
    fetch,
    baseUrl: process.env.MYJOURNEY_INTERNAL_URL || "http://localhost:3000",
    secret,
    payload,
  });
  return r.ok ? markOnboarded(offerId, r.journeyId) : markFailed(offerId, r.error);
}

/** Recruiter view of an offer. The personal email is only included while the browser still needs it for the invite. */
export function recruiterView(o: Offer) {
  const { candidate, ...rest } = o;
  return {
    ...rest,
    candidate: candidate
      ? { firstName: candidate.firstName, lastName: candidate.lastName, ...(o.status === "accepted_pending_invite" ? { email: candidate.email } : {}) }
      : undefined,
  };
}
