import type { Configuration } from "@azure/msal-browser";

/**
 * MSAL browser configuration from env. The authority is the SPECIFIC tenant
 * (never "common"/"organizations") so B2B guests sign in against the home tenant.
 * NEXT_PUBLIC_ENTRA_TENANT_ID must be the tenant GUID (it is compared with the token's `tid`/issuer).
 */
export function getMsalConfig(): Configuration {
  const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID;
  const tenantId = process.env.NEXT_PUBLIC_ENTRA_TENANT_ID;
  if (!clientId || !tenantId) {
    throw new Error("Set NEXT_PUBLIC_ENTRA_CLIENT_ID and NEXT_PUBLIC_ENTRA_TENANT_ID (or use AUTH_MODE=demo)");
  }
  const redirectUri =
    process.env.NEXT_PUBLIC_ENTRA_REDIRECT_URI || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  return {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri,
      postLogoutRedirectUri: redirectUri,
    },
    cache: { cacheLocation: "sessionStorage" },
  };
}

/** We validate the ID token server-side; no extra API scopes are needed. */
export const LOGIN_SCOPES = ["openid", "profile"];

/** D19: real Graph guest invites from the admin's browser. Inlined at build time, so read the literal names. */
export const graphInvitesEnabled = (): boolean => process.env.NEXT_PUBLIC_GRAPH_INVITES === "on";
export const inviteDemoMailbox = (): string | undefined => process.env.NEXT_PUBLIC_INVITE_DEMO_MAILBOX || undefined;
