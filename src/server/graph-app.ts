import "server-only";
import { ConfidentialClientApplication } from "@azure/msal-node";

/**
 * App-only Microsoft Graph access for guest-to-member conversion (D39). SERVER ONLY: the client secret never goes to
 * the browser, the database, a response or a log line. Pattern copied from demo/mock-workday/src/lib/graphAuth.ts
 * (separate app, so nothing is imported across apps).
 */
export interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Mailbox the welcome email is sent from (needs a licence). */
  senderUpn: string;
  /** The tenant's onmicrosoft domain for new work UPNs. Never hard-coded in the repo. */
  memberDomain: string;
}

/** Null unless GUEST_CONVERSION=on and every value is set: the caller then simulates (no Graph call). */
export function graphConfig(env: Record<string, string | undefined> = process.env): GraphConfig | null {
  if ((env.GUEST_CONVERSION ?? "").trim().toLowerCase() !== "on") return null;
  const tenantId = (env.NEXT_PUBLIC_ENTRA_TENANT_ID ?? "").trim();
  const clientId = (env.MYJOURNEY_GRAPH_CLIENT_ID ?? "").trim();
  const clientSecret = env.MYJOURNEY_GRAPH_CLIENT_SECRET ?? "";
  const senderUpn = (env.MYJOURNEY_MAIL_SENDER_UPN ?? "").trim();
  const memberDomain = (env.MEMBER_UPN_DOMAIN ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!tenantId || !clientId || !clientSecret || !senderUpn || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(memberDomain)) return null;
  return { tenantId, clientId, clientSecret, senderUpn, memberDomain };
}

const SCOPES = ["https://graph.microsoft.com/.default"];
const EXPIRY_MARGIN_MS = 5 * 60_000;

let app: { key: string; client: ConfidentialClientApplication } | null = null;
let cached: { key: string; token: string; expiresAt: number } | null = null;

export function resetGraphTokenCache(): void {
  app = null;
  cached = null;
}

/** Strips anything that looks like an email address (and caps the length) so errors are safe to store and show. */
export function redactEmails(s: string): string {
  return s.replace(/[^\s<>"',;()]+@[^\s<>"',;()]+/g, "[email]").slice(0, 300);
}

export class GraphError extends Error {
  readonly code: string;
  constructor(public status: number, code: string, message: string) {
    super(redactEmails(message));
    this.name = "GraphError";
    this.code = redactEmails(code);
  }
}

export async function getGraphToken(c: GraphConfig, now: number = Date.now()): Promise<string> {
  const key = `${c.tenantId}|${c.clientId}`;
  if (cached && cached.key === key && cached.expiresAt - EXPIRY_MARGIN_MS > now) return cached.token;
  if (!app || app.key !== key) {
    app = {
      key,
      client: new ConfidentialClientApplication({
        auth: { clientId: c.clientId, authority: `https://login.microsoftonline.com/${c.tenantId}`, clientSecret: c.clientSecret },
      }),
    };
  }
  const r = await app.client.acquireTokenByClientCredential({ scopes: SCOPES });
  if (!r?.accessToken) throw new GraphError(0, "token_unavailable", "Could not obtain a Graph token");
  cached = { key, token: r.accessToken, expiresAt: r.expiresOn ? r.expiresOn.getTime() : now + 50 * 60_000 };
  return r.accessToken;
}

/** Calls Graph with the app token. Throws GraphError (code/message redacted) on a non-2xx response. */
export async function graphRequest<T = unknown>(c: GraphConfig, method: "GET" | "POST", url: string, body?: unknown): Promise<T | null> {
  const token = await getGraphToken(c);
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new GraphError(res.status, j?.error?.code ?? `http_${res.status}`, j?.error?.message ?? `Graph returned ${res.status}`);
  }
  if (res.status === 202 || res.status === 204) return null;
  return (await res.json().catch(() => null)) as T | null;
}
