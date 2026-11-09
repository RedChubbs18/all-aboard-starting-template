/**
 * Browser-side Microsoft Graph guest invite (D19). Delegated token from the signed-in admin (MSAL),
 * no client secret. Everything is injected (fetch, token) so it is unit-testable and never logs tokens.
 *
 * Entra sends its own standard B2B invitation email to the address typed at demo time. Because that
 * email leaves the tenant, nothing is sent unless the organiser-approval flag is set (`approved`).
 */
export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
/** Only the invite scope is needed; Entra sends the email itself. Requested only when sending. */
export const GRAPH_INVITE_SCOPES = ["User.Invite.All"];
export const DISPLAY_NAME_PREFIX = "team05-";
export const INVITE_MESSAGE = "Welcome to Lloyds Banking Group. Accept this invitation to start your onboarding.";

export type FallbackReason = "consent_required" | "not_approved" | "invalid_email" | "no_token" | "error";
export const FALLBACK_REASONS = ["consent_required", "not_approved", "invalid_email", "no_token", "error"] as const;

export const FALLBACK_MESSAGES: Record<FallbackReason, string> = {
  consent_required: "The app needs organiser-approved permission to invite guests; using the demo invite instead.",
  not_approved: "External invite email not approved for this environment; using the demo invite instead.",
  invalid_email: "The personal email address is not valid, so no invite was sent; using the demo invite instead.",
  no_token: "Microsoft permission for invites was not granted in this session; using the demo invite instead.",
  error: "Microsoft Graph could not send the invite; using the demo invite instead.",
};

export type InviteOutcome =
  | { status: "invited"; guestObjectId: string }
  | { status: "fallback"; reason: FallbackReason };

const EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
export const isValidEmail = (e: string): boolean => e.length <= 254 && EMAIL.test(e);

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
    sendInvitationMessage: true,
    invitedUserMessageInfo: { customizedMessageBody: INVITE_MESSAGE },
  };
}

export interface SendInviteInput {
  fetch: typeof fetch;
  accessToken: string;
  /** NEXT_PUBLIC_GRAPH_INVITE_EXTERNAL_APPROVED === "yes": organisers approved external invite email. */
  approved: boolean;
  personalEmail: string;
  starterName: string;
  redirectUrl: string;
}

/** Invite via Graph; Entra emails the invitation. Never throws. Refuses (no Graph call) unless approved. */
export async function sendGraphInvite(i: SendInviteInput): Promise<InviteOutcome> {
  if (!i.approved) return { status: "fallback", reason: "not_approved" };
  const email = i.personalEmail.trim();
  if (!isValidEmail(email)) return { status: "fallback", reason: "invalid_email" };
  try {
    const inv = await fetch_(i, buildInvitationBody({ email, displayName: guestDisplayName(i.starterName), redirectUrl: i.redirectUrl }));
    if (inv.status === 401 || inv.status === 403) return { status: "fallback", reason: "consent_required" };
    if (!inv.ok) return { status: "fallback", reason: "error" };
    const j = (await inv.json()) as { invitedUser?: { id?: string } };
    const guestObjectId = j.invitedUser?.id;
    if (!guestObjectId) return { status: "fallback", reason: "error" };
    return { status: "invited", guestObjectId };
  } catch {
    return { status: "fallback", reason: "error" };
  }
}

function fetch_(i: SendInviteInput, body: unknown) {
  return i.fetch(`${GRAPH_BASE}/invitations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${i.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
