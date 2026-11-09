/**
 * Browser-side Microsoft Graph guest invite (copied pattern from MyJourney's src/lib/graph/invite.ts, not imported).
 * Entra sends its own invitation email. External emails are only sent when approved; otherwise we simulate.
 */
export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
export const GRAPH_INVITE_SCOPES = ["User.Invite.All"];
export const DISPLAY_NAME_PREFIX = "team05-";

export function guestDisplayName(first: string, last: string): string {
  const parts = `${first} ${last}`
    .normalize("NFKD")
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.replace(/[^a-z0-9]+/g, ""))
    .filter(Boolean);
  return DISPLAY_NAME_PREFIX + (parts.length ? parts : ["starter"]).join("-");
}

export function accessInstructions(myJourneyUrl: string): string[] {
  return [
    "Open the invitation email from Microsoft (it may be in your junk folder) and accept the invitation.",
    "Sign in with the same email address the invitation was sent to.",
    `Open MyJourney at ${myJourneyUrl} and sign in to start your onboarding.`,
  ];
}

export function inviteMessage(myJourneyUrl: string): string {
  return `Welcome aboard! Your offer has been accepted. To access MyJourney: ${accessInstructions(myJourneyUrl).map((s, i) => `${i + 1}. ${s}`).join(" ")}`;
}

export function buildInvitationBody(i: { email: string; firstName: string; lastName: string; redirectUrl: string }) {
  return {
    invitedUserEmailAddress: i.email,
    invitedUserDisplayName: guestDisplayName(i.firstName, i.lastName),
    inviteRedirectUrl: i.redirectUrl,
    sendInvitationMessage: true,
    invitedUserMessageInfo: { customizedMessageBody: inviteMessage(i.redirectUrl) },
  };
}

export type InviteOutcome =
  | { status: "invited"; guestObjectId: string }
  | { status: "simulated"; message: string; displayName: string }
  | { status: "failed"; error: string };

export interface InviteInput {
  fetch: typeof fetch;
  /** Lazily acquires the delegated token: only called when we are really going to call Graph. */
  getToken: () => Promise<string | null>;
  approved: boolean;
  email: string;
  firstName: string;
  lastName: string;
  redirectUrl: string;
}

/** Never throws. Not approved: no token request and no Graph call, returns the simulated email preview. */
export async function runInvite(i: InviteInput): Promise<InviteOutcome> {
  const body = buildInvitationBody({ email: i.email, firstName: i.firstName, lastName: i.lastName, redirectUrl: i.redirectUrl });
  if (!i.approved) return { status: "simulated", message: body.invitedUserMessageInfo.customizedMessageBody, displayName: body.invitedUserDisplayName };
  try {
    const token = await i.getToken();
    if (!token) return { status: "failed", error: "Microsoft permission for invites was not granted in this session." };
    const res = await i.fetch(`${GRAPH_BASE}/invitations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) return { status: "failed", error: "Not permitted to invite guests (consent or role missing)." };
    if (!res.ok) return { status: "failed", error: `Microsoft Graph returned ${res.status}.` };
    const j = (await res.json()) as { invitedUser?: { id?: string } };
    const id = j.invitedUser?.id;
    return id ? { status: "invited", guestObjectId: id } : { status: "failed", error: "Graph response had no guest id." };
  } catch {
    return { status: "failed", error: "Microsoft Graph could not be reached." };
  }
}
