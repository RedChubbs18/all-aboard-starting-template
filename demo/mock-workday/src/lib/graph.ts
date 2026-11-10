/**
 * Server-side Microsoft Graph guest invite (pattern copied from MyJourney's src/lib/graph/invite.ts, not imported).
 * Uses an app-only token (see graphAuth.ts). Entra sends its own invitation email. External emails are only sent
 * when approved and credentials exist; otherwise we simulate.
 */
export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
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
    "Open the email from Microsoft on behalf of Lloyds Banking Group (MyJourney) (it may be in your junk folder) and select Accept invitation.",
    "Sign in with the same personal email address the invitation was sent to. You may receive a one-time passcode by email: enter it when asked.",
    `Open MyJourney at ${myJourneyUrl} and sign in to start your onboarding.`,
  ];
}

export function inviteMessage(myJourneyUrl: string): string {
  return `Welcome aboard! Your offer has been accepted. To access MyJourney: ${accessInstructions(myJourneyUrl).map((s, i) => `${i + 1}. ${s}`).join(" ")}`;
}

/**
 * Graph rejects non-https invite redirect URLs ("The invite redirect URL field is invalid"), e.g. http://localhost.
 * Use MyJourney's URL when it is https (a tunnel); otherwise Microsoft's My Apps page for our tenant, which is the
 * standard landing page after accepting a guest invite. The email text still points the candidate at MyJourney.
 */
export function inviteRedirectFor(myJourneyUrl: string, tenantId: string | undefined = process.env.WORKDAY_GRAPH_TENANT_ID || process.env.NEXT_PUBLIC_ENTRA_TENANT_ID): string {
  try {
    if (new URL(myJourneyUrl).protocol === "https:") return myJourneyUrl;
  } catch {
    // fall through to My Apps
  }
  return tenantId ? `https://myapplications.microsoft.com/?tenantid=${encodeURIComponent(tenantId)}` : "https://myapplications.microsoft.com/";
}

export function buildInvitationBody(i: { email: string; firstName: string; lastName: string; redirectUrl: string }) {
  return {
    invitedUserEmailAddress: i.email,
    invitedUserDisplayName: guestDisplayName(i.firstName, i.lastName),
    inviteRedirectUrl: inviteRedirectFor(i.redirectUrl),
    sendInvitationMessage: true,
    invitedUserMessageInfo: { customizedMessageBody: inviteMessage(i.redirectUrl) },
  };
}

export type InviteOutcome =
  | { status: "invited"; guestObjectId: string; inviteRedeemUrl?: string }
  | { status: "simulated"; message: string; displayName: string }
  | { status: "failed"; error: string };

export interface InviteInput {
  fetch: typeof fetch;
  /** Lazily acquires the app-only token: only called when we are really going to call Graph. */
  getToken: () => Promise<string | null>;
  approved: boolean;
  email: string;
  firstName: string;
  lastName: string;
  redirectUrl: string;
  /** Retries for 429/503/504 only (the invite was refused, so it cannot have been sent). Default 3 attempts. */
  attempts?: number;
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Graph's own error code and message (e.g. "BadRequest: The invited user already exists"), so the recruiter
 * can see why an invite was refused. Email addresses are redacted (the store must not hold personal email).
 */
export async function graphErrorDetail(res: { json(): Promise<unknown> }): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { code?: unknown; message?: unknown } };
    const code = typeof j.error?.code === "string" ? j.error.code : "";
    const msg = typeof j.error?.message === "string" ? j.error.message : "";
    const text = `${code}${code && msg ? ": " : ""}${msg}`.replace(/[^\s@]+@[^\s@]+/g, "[email]").slice(0, 300);
    return text ? ` (${text})` : "";
  } catch {
    return "";
  }
}

/** Never throws. Not approved: no token request and no Graph call, returns the simulated email preview. */
export async function runInvite(i: InviteInput): Promise<InviteOutcome> {
  const body = buildInvitationBody({ email: i.email, firstName: i.firstName, lastName: i.lastName, redirectUrl: i.redirectUrl });
  if (!i.approved) return { status: "simulated", message: body.invitedUserMessageInfo.customizedMessageBody, displayName: body.invitedUserDisplayName };
  const attempts = i.attempts ?? 3;
  const base = i.backoffMs ?? 1000;
  const sleep = i.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  try {
    const token = await i.getToken();
    if (!token) return { status: "failed", error: "Could not get a Microsoft Graph token (check the WORKDAY_GRAPH_* settings)." };
    for (let n = 0; n < attempts; n++) {
      if (n > 0) await sleep(base * 2 ** (n - 1));
      const res = await i.fetch(`${GRAPH_BASE}/invitations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401 || res.status === 403) return { status: "failed", error: "Not permitted to invite guests (the User.Invite.All application permission or its admin consent is missing)." };
      if ([429, 503, 504].includes(res.status) && n < attempts - 1) continue;
      if (!res.ok) return { status: "failed", error: `Microsoft Graph returned ${res.status}${await graphErrorDetail(res)}.` };
      const j = (await res.json()) as { invitedUser?: { id?: string }; inviteRedeemUrl?: string };
      const id = j.invitedUser?.id;
      return id ? { status: "invited", guestObjectId: id, inviteRedeemUrl: typeof j.inviteRedeemUrl === "string" ? j.inviteRedeemUrl : undefined } : { status: "failed", error: "Graph response had no guest id." };
    }
    return { status: "failed", error: "Microsoft Graph kept refusing the request." };
  } catch {
    // A network error may have happened after Graph accepted the request, so it is not retried automatically.
    return { status: "failed", error: "Microsoft Graph could not be reached or answered unexpectedly. Check the guest list before retrying." };
  }
}
