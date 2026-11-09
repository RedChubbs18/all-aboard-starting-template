/**
 * Browser-side Microsoft Graph guest invite (D19). Delegated token from the signed-in admin (MSAL),
 * no client secret. Everything is injected (fetch, token) so it is unit-testable and never logs tokens.
 *
 * Hackathon rule: the redemption link is emailed ONLY to an in-tenant demo mailbox whose domain equals
 * the signed-in admin's UPN domain. The starter's personal address is never emailed.
 */
import { buildWelcomeEmail } from "./email";

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
/** Both live on the Graph resource, so one delegated token covers them. Requested only when sending. */
export const GRAPH_INVITE_SCOPES = ["User.Invite.All", "Mail.Send"];
export const DISPLAY_NAME_PREFIX = "team05-";

export type FallbackReason = "consent_required" | "mailbox_not_allowed" | "no_token" | "error";
export const FALLBACK_REASONS = ["consent_required", "mailbox_not_allowed", "no_token", "error"] as const;

export const FALLBACK_MESSAGES: Record<FallbackReason, string> = {
  consent_required: "The app needs organiser-approved permission to invite guests; using the demo invite instead.",
  mailbox_not_allowed: "The demo invite mailbox is not set or is outside your tenant, so no email was sent; using the demo invite instead.",
  no_token: "Microsoft permission for invites was not granted in this session; using the demo invite instead.",
  error: "Microsoft Graph could not send the invite; using the demo invite instead.",
};

export type InviteOutcome =
  | { status: "invited"; guestObjectId: string; mailSent: boolean }
  | { status: "fallback"; reason: FallbackReason };

/** Synthetic guest display name: team05-<first>-<last>, lowercase ASCII, so no real name leaks into the tenant. */
export function guestDisplayName(fullName: string): string {
  const parts = fullName
    .normalize("NFKD")
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.replace(/[^a-z0-9]+/g, ""))
    .filter(Boolean);
  return DISPLAY_NAME_PREFIX + (parts.length ? parts : ["starter"]).join("-");
}

export function buildInvitationBody(i: { email: string; displayName: string; redirectUrl: string }) {
  return {
    invitedUserEmailAddress: i.email,
    invitedUserDisplayName: i.displayName,
    inviteRedirectUrl: i.redirectUrl,
    sendInvitationMessage: false,
  };
}

const MAILBOX = /^[A-Za-z0-9._%+'-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)$/;

/**
 * Returns the single allowed mailbox, or null when mail must not be sent: unset, not one plain address,
 * or its domain differs (exactly) from the signed-in admin's UPN domain.
 */
export function allowedDemoMailbox(mailbox: string | undefined | null, adminUpn: string | undefined | null): string | null {
  if (!mailbox || !adminUpn) return null;
  const mb = mailbox.trim();
  const mbDomain = MAILBOX.exec(mb)?.[1]?.toLowerCase();
  const adminDomain = adminUpn.includes("@") ? adminUpn.slice(adminUpn.lastIndexOf("@") + 1).trim().toLowerCase() : null;
  if (!mbDomain || !adminDomain || mbDomain !== adminDomain) return null;
  return mb;
}

export interface SendInviteInput {
  fetch: typeof fetch;
  accessToken: string;
  adminUpn: string;
  demoMailbox: string | undefined;
  personalEmail: string;
  starterName: string;
  redirectUrl: string;
  startDate?: string;
}

function post(f: typeof fetch, token: string, path: string, body: unknown) {
  return f(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Invite via Graph, then (hackathon mode) email the redeem link to the in-tenant mailbox. Never throws. */
export async function sendGraphInvite(i: SendInviteInput): Promise<InviteOutcome> {
  // Guard first: with nowhere safe to send the link, do not create a guest at all.
  const mailbox = allowedDemoMailbox(i.demoMailbox, i.adminUpn);
  if (!mailbox) return { status: "fallback", reason: "mailbox_not_allowed" };
  try {
    const inv = await post(i.fetch, i.accessToken, "/invitations", buildInvitationBody({ email: i.personalEmail, displayName: guestDisplayName(i.starterName), redirectUrl: i.redirectUrl }));
    if (inv.status === 401 || inv.status === 403) return { status: "fallback", reason: "consent_required" };
    if (!inv.ok) return { status: "fallback", reason: "error" };
    const j = (await inv.json()) as { inviteRedeemUrl?: string; invitedUser?: { id?: string } };
    const guestObjectId = j.invitedUser?.id;
    if (!guestObjectId || !j.inviteRedeemUrl) return { status: "fallback", reason: "error" };

    const mail = buildWelcomeEmail({ starterName: i.starterName, redeemUrl: j.inviteRedeemUrl, productionRecipient: i.personalEmail, startDate: i.startDate });
    const sent = await post(i.fetch, i.accessToken, "/me/sendMail", {
      message: { subject: mail.subject, body: { contentType: "HTML", content: mail.html }, toRecipients: [{ emailAddress: { address: mailbox } }] },
      saveToSentItems: false,
    });
    return { status: "invited", guestObjectId, mailSent: sent.ok };
  } catch {
    return { status: "fallback", reason: "error" };
  }
}
