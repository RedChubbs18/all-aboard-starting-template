import { ConfidentialClientApplication } from "@azure/msal-node";

/**
 * App-only Microsoft Graph access for the separate `team05-mock-workday` app registration (confidential client,
 * Application permission User.Invite.All). SERVER ONLY: the client secret never goes to the browser, the store,
 * a response or a log line.
 */
export interface GraphCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export function graphCredentials(env: Record<string, string | undefined> = process.env): GraphCredentials | null {
  const tenantId = (env.WORKDAY_GRAPH_TENANT_ID || env.NEXT_PUBLIC_ENTRA_TENANT_ID || "").trim();
  const clientId = (env.WORKDAY_GRAPH_CLIENT_ID || "").trim();
  const clientSecret = env.WORKDAY_GRAPH_CLIENT_SECRET || "";
  return tenantId && clientId && clientSecret ? { tenantId, clientId, clientSecret } : null;
}

/** Real invites need the organisers' approval (server env; the old NEXT_PUBLIC_ name is still read as a fallback). */
export function externalInvitesApproved(env: Record<string, string | undefined> = process.env): boolean {
  return (env.GRAPH_INVITE_EXTERNAL_APPROVED ?? env.NEXT_PUBLIC_GRAPH_INVITE_EXTERNAL_APPROVED) === "yes";
}

const SCOPES = ["https://graph.microsoft.com/.default"];
const EXPIRY_MARGIN_MS = 5 * 60_000;

let app: { key: string; client: ConfidentialClientApplication } | null = null;
let cached: { key: string; token: string; expiresAt: number } | null = null;

export function resetGraphTokenCache(): void {
  app = null;
  cached = null;
}

/** Returns an app-only Graph token (cached in memory until shortly before expiry), or null without credentials. */
export async function getGraphToken(creds: GraphCredentials | null = graphCredentials(), now: number = Date.now()): Promise<string | null> {
  if (!creds) return null;
  const key = `${creds.tenantId}|${creds.clientId}`;
  if (cached && cached.key === key && cached.expiresAt - EXPIRY_MARGIN_MS > now) return cached.token;
  if (!app || app.key !== key) {
    app = {
      key,
      client: new ConfidentialClientApplication({
        auth: { clientId: creds.clientId, authority: `https://login.microsoftonline.com/${creds.tenantId}`, clientSecret: creds.clientSecret },
      }),
    };
  }
  const r = await app.client.acquireTokenByClientCredential({ scopes: SCOPES });
  if (!r?.accessToken) return null;
  cached = { key, token: r.accessToken, expiresAt: r.expiresOn ? r.expiresOn.getTime() : now + 50 * 60_000 };
  return r.accessToken;
}
