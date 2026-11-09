"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Configuration, PublicClientApplication } from "@azure/msal-browser";
import { GRAPH_INVITE_SCOPES } from "./graph";

/** Same pattern as MyJourney's src/lib/auth/client.tsx: one MSAL instance, redirect handled exactly once. */
const LOGIN_SCOPES = ["openid", "profile"];
const TOKEN_REDIRECT_FLAG = "token-renew-redirect";
const GRAPH_REDIRECT_FLAG = "graph-consent-redirect";

function msalConfig(): Configuration {
  const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID;
  const tenantId = process.env.NEXT_PUBLIC_ENTRA_TENANT_ID;
  if (!clientId || !tenantId) throw new Error("Set NEXT_PUBLIC_ENTRA_CLIENT_ID and NEXT_PUBLIC_ENTRA_TENANT_ID in demo/mock-workday/.env");
  const redirectUri = process.env.NEXT_PUBLIC_ENTRA_REDIRECT_URI || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3001");
  return {
    auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}`, redirectUri, postLogoutRedirectUri: redirectUri },
    cache: { cacheLocation: "sessionStorage" },
  };
}

let boot: Promise<PublicClientApplication> | null = null;
function bootMsal(): Promise<PublicClientApplication> {
  if (!boot) {
    boot = (async () => {
      const { PublicClientApplication } = await import("@azure/msal-browser");
      const app = new PublicClientApplication(msalConfig());
      await app.initialize();
      const redirect = await app.handleRedirectPromise({ navigateToLoginRequestUrl: false });
      if (redirect?.account) app.setActiveAccount(redirect.account);
      else if (!app.getActiveAccount() && app.getAllAccounts()[0]) app.setActiveAccount(app.getAllAccounts()[0]);
      return app;
    })().catch((e) => {
      boot = null;
      throw e;
    });
  }
  return boot;
}

export interface AuthValue {
  status: "loading" | "unauthenticated" | "authenticated" | "error";
  error: string | null;
  account: string | null;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** fetch() with the signed-in recruiter's ID token as bearer. */
  apiFetch(path: string, init?: RequestInit): Promise<Response>;
  /** Delegated Graph token for User.Invite.All. At most one consent redirect, then reports null instead of looping. */
  acquireInviteToken(): Promise<string | null>;
}

const Ctx = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthValue["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const msal = useRef<PublicClientApplication | null>(null);

  useEffect(() => {
    let cancelled = false;
    bootMsal()
      .then((app) => {
        if (cancelled) return;
        msal.current = app;
        const a = app.getActiveAccount();
        setAccount(a?.username ?? null);
        setStatus(a ? "authenticated" : "unauthenticated");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Sign-in failed");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    const app = msal.current;
    const acct = app?.getActiveAccount() ?? app?.getAllAccounts()[0];
    if (!app || !acct) return null;
    try {
      const r = await app.acquireTokenSilent({ scopes: LOGIN_SCOPES, account: acct });
      sessionStorage.removeItem(TOKEN_REDIRECT_FLAG);
      return r.idToken;
    } catch {
      if (sessionStorage.getItem(TOKEN_REDIRECT_FLAG)) {
        sessionStorage.removeItem(TOKEN_REDIRECT_FLAG);
        return null;
      }
      sessionStorage.setItem(TOKEN_REDIRECT_FLAG, "1");
      await app.acquireTokenRedirect({ scopes: LOGIN_SCOPES, account: acct });
      return null;
    }
  }, []);

  const apiFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      const t = await getIdToken();
      if (t) headers.set("Authorization", `Bearer ${t}`);
      if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
      return fetch(path, { ...init, headers, credentials: "same-origin" });
    },
    [getIdToken],
  );

  const acquireInviteToken = useCallback(async (): Promise<string | null> => {
    const app = msal.current;
    const acct = app?.getActiveAccount() ?? app?.getAllAccounts()[0];
    if (!app || !acct) return null;
    try {
      const r = await app.acquireTokenSilent({ scopes: GRAPH_INVITE_SCOPES, account: acct });
      sessionStorage.removeItem(GRAPH_REDIRECT_FLAG);
      return r.accessToken;
    } catch {
      if (sessionStorage.getItem(GRAPH_REDIRECT_FLAG)) {
        sessionStorage.removeItem(GRAPH_REDIRECT_FLAG);
        return null;
      }
      sessionStorage.setItem(GRAPH_REDIRECT_FLAG, "1");
      await app.acquireTokenRedirect({ scopes: GRAPH_INVITE_SCOPES, account: acct });
      return null;
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      error,
      account,
      apiFetch,
      acquireInviteToken,
      async signIn() {
        await msal.current?.loginRedirect({ scopes: LOGIN_SCOPES, prompt: "select_account" });
      },
      async signOut() {
        await msal.current?.logoutRedirect();
      },
    }),
    [status, error, account, apiFetch, acquireInviteToken],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
