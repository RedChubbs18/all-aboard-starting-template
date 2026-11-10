import { webhookSecret } from "./hmac";
import { externalInvitesApproved, getGraphToken, graphCredentials } from "./graphAuth";
import { runInvite, type InviteOutcome } from "./graph";
import { buildWebhookPayload, sendOfferAccepted } from "./webhook";
import { addEvent, claimInvite, getOfferById, markFailed, markOnboarded, recordInvite, type Offer } from "./store";

const g = globalThis as unknown as { __wdRedeem?: Map<string, string> };
/** Fallback invitation links: in memory only (never in the store), returned to the recruiter console only. */
const redeemLinks = (): Map<string, string> => (g.__wdRedeem ??= new Map());
export const getRedeemUrl = (offerId: string): string | undefined => redeemLinks().get(offerId);
export const clearRedeemUrls = (): void => redeemLinks().clear();

export const myJourneyPublicUrl = (): string => process.env.NEXT_PUBLIC_MYJOURNEY_PUBLIC_URL || "http://localhost:3000";

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

/** Webhook step plus its activity line. */
export async function notifyWithEvents(offerId: string, notify: (id: string) => Promise<Offer | null> = notifyMyJourney): Promise<Offer | null> {
  await addEvent(offerId, "Telling MyJourney to start the journey.");
  const o = await notify(offerId);
  if (o?.status === "onboarded") await addEvent(offerId, "MyJourney created the starter and their journey. Done.");
  else if (o?.status === "failed") await addEvent(offerId, `MyJourney step failed: ${o.error ?? "unknown"}. Use Retry.`);
  return o;
}

export interface PipelineDeps {
  fetch?: typeof fetch;
  getToken?: () => Promise<string | null>;
  notify?: (id: string) => Promise<Offer | null>;
  approved?: boolean;
  hasCredentials?: boolean;
  redirectUrl?: string;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Accept pipeline, run on the server after the accept response: claim (at most once per offer) -> Entra invite
 * (real only when approved AND credentials exist, otherwise simulated) -> record -> MyJourney webhook.
 * Never throws. Status and activity are recorded in the store.
 */
export async function runAcceptPipeline(offerId: string, deps: PipelineDeps = {}): Promise<void> {
  try {
    const offer = await claimInvite(offerId);
    if (!offer?.candidate) return; // already claimed or recorded: never invite twice
    const c = offer.candidate;
    const approvedFlag = deps.approved ?? externalInvitesApproved();
    const hasCreds = deps.hasCredentials ?? graphCredentials() !== null;
    const real = approvedFlag && hasCreds;
    await addEvent(offerId, `${c.firstName} ${c.lastName} accepted the offer for ${offer.jobTitle}.`);
    if (real) await addEvent(offerId, "Sending a real Microsoft Entra guest invitation.");
    else if (approvedFlag) await addEvent(offerId, "Real invites are approved but the WORKDAY_GRAPH_* credentials are not set: simulating the invitation (no Graph call).");
    else await addEvent(offerId, "External invites are not approved here: simulating the invitation (no Graph call).");

    const outcome: InviteOutcome = await runInvite({
      fetch: deps.fetch ?? fetch,
      getToken: deps.getToken ?? (() => getGraphToken()),
      approved: real,
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
      redirectUrl: deps.redirectUrl ?? myJourneyPublicUrl(),
      sleep: deps.sleep,
    });

    if (outcome.status === "invited") {
      if (outcome.inviteRedeemUrl) redeemLinks().set(offerId, outcome.inviteRedeemUrl);
      await recordInvite(offerId, { guestObjectId: outcome.guestObjectId, inviteStatus: "invited" });
      await addEvent(offerId, "Guest invited. Microsoft is emailing the candidate." + (outcome.inviteRedeemUrl ? " A fallback invitation link is available here (recruiter only)." : ""));
    } else if (outcome.status === "simulated") {
      await recordInvite(offerId, { guestObjectId: null, inviteStatus: "simulated" });
      await addEvent(offerId, `Invite simulated. Message that would be sent: ${outcome.message}`);
    } else {
      await recordInvite(offerId, { guestObjectId: null, inviteStatus: "failed", error: outcome.error });
      await addEvent(offerId, `Invite failed: ${outcome.error} Use Retry.`);
      return;
    }
    await notifyWithEvents(offerId, deps.notify);
  } catch (e) {
    console.error("[accept pipeline]", e instanceof Error ? e.name : "error"); // never the message: it could echo credentials
    await markFailed(offerId, "Unexpected error while sending the invite. Use Retry.").catch(() => undefined);
  }
}

/** Recruiter view of an offer. Never includes the personal email; the redeem link comes from memory. */
export function recruiterView(o: Offer) {
  const { candidate, inviteClaimedAt: _claimed, ...rest } = o;
  void _claimed;
  const redeemUrl = getRedeemUrl(o.id);
  return {
    ...rest,
    candidate: candidate ? { firstName: candidate.firstName, lastName: candidate.lastName } : undefined,
    ...(redeemUrl ? { redeemUrl } : {}),
  };
}
