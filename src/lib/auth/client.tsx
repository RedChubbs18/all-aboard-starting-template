"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PublicClientApplication } from "@azure/msal-browser";
import { LOGIN_SCOPES, getMsalConfig } from "./config";
import { buildLoginRequest } from "./login-request";
import type { SessionUser } from "./roles";

export type SessionStatus = "loading" | "unauthenticated" | "authenticated" | "not_onboarded" | "error";

export interface Persona {
  id: string;
  displayName: string;
  roles: string[];
  teamName: string | null;
}

export interface SessionValue {
  status: SessionStatus;
  mode: "demo" | "entra" | null;
  user: SessionUser | null;
  error: string | null;
  personas: Persona[];
  /** Demo mode off the host computer: the server wants DEMO_PIN with the persona switch. */
  demoPinRequired: boolean;
  /** Entra: redirect to Microsoft sign-in. Demo: no-op (use switchPersona). */
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** Demo mode only. `pin` is sent when the server requires DEMO_PIN. */
  switchPersona(userId: string, pin?: string): Promise<void>;
  /**
   * Entra only. Delegated Microsoft Graph token for `scopes`, requested incrementally (not at login).
   * Falls back to ONE redirect for consent; a second failure after returning is reported, never looped.
   */
  acquireGraphToken(scopes: string[]): Promise<GraphTokenResult>;
  /** fetch() that authenticates the call (bearer token in Entra mode, cookie in demo mode). */
  apiFetch(path: string, init?: RequestInit): Promise<Response>;
}

export type GraphTokenResult = { ok: true; accessToken: string; upn: string } | { ok: false; reason: "no_token" | "consent_required" };

const GRAPH_REDIRECT_FLAG = "graph-consent-redirect";
const TOKEN_REDIRECT_FLAG = "token-renew-redirect";

const Ctx = createContext<SessionValue | null>(null);

/**
 * One MSAL instance per page load, and the redirect response handled exactly once.
 * React (dev Strict Mode) runs effects twice; creating a client and calling
 * handleRedirectPromise inside the effect made two instances race over the redirect
 * response and keep re-navigating to the start page (an infinite loading loop).
 * We also don't navigate back to the start page: the app lands on "/", and the home page
 * routes each role to its own home.
 */
type MsalBoot = { app: PublicClientApplication };
let msalBoot: Promise<MsalBoot> | null = null;
function bootMsal(): Promise<MsalBoot> {
  if (!msalBoot) {
    msalBoot = (async () => {
      const { PublicClientApplication } = await import("@azure/msal-browser");
      const app = new PublicClientApplication(getMsalConfig());
      await app.initialize();
      const redirect = await app.handleRedirectPromise({ navigateToLoginRequestUrl: false });
      if (redirect?.account) app.setActiveAccount(redirect.account);
      else if (!app.getActiveAccount() && app.getAllAccounts()[0]) app.setActiveAccount(app.getAllAccounts()[0]);
      return { app };
    })().catch((e) => {
      msalBoot = null; // allow a retry on the next mount
      throw e;
    });
  }
  return msalBoot;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside <AuthProvider>");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [mode, setMode] = useState<"demo" | "entra" | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [demoPinRequired, setDemoPinRequired] = useState(false);
  const msal = useRef<PublicClientApplication | null>(null);
  const modeRef = useRef<"demo" | "entra" | null>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    const app = msal.current;
    const account = app?.getActiveAccount() ?? app?.getAllAccounts()[0];
    if (!app || !account) return null;
    try {
      const r = await app.acquireTokenSilent({ scopes: LOGIN_SCOPES, account });
      sessionStorage.removeItem(TOKEN_REDIRECT_FLAG);
      return r.idToken;
    } catch {
      // At most one interactive redirect per failure; if we're already back from one, give up
      // (the caller then sees 401 and shows the sign-in screen) instead of looping.
      if (sessionStorage.getItem(TOKEN_REDIRECT_FLAG)) {
        sessionStorage.removeItem(TOKEN_REDIRECT_FLAG);
        return null;
      }
      sessionStorage.setItem(TOKEN_REDIRECT_FLAG, "1");
      await app.acquireTokenRedirect({ ...buildLoginRequest(), account });
      return null;
    }
  }, []);

  const acquireGraphToken = useCallback(async (scopes: string[]): Promise<GraphTokenResult> => {
    const app = msal.current;
    const account = app?.getActiveAccount() ?? app?.getAllAccounts()[0];
    if (!app || !account) return { ok: false, reason: "no_token" };
    try {
      const r = await app.acquireTokenSilent({ scopes, account });
      sessionStorage.removeItem(GRAPH_REDIRECT_FLAG);
      return { ok: true, accessToken: r.accessToken, upn: account.username };
    } catch {
      // One consent redirect per attempt. If we already tried and are back, report instead of looping.
      if (sessionStorage.getItem(GRAPH_REDIRECT_FLAG)) {
        sessionStorage.removeItem(GRAPH_REDIRECT_FLAG);
        return { ok: false, reason: "consent_required" };
      }
      sessionStorage.setItem(GRAPH_REDIRECT_FLAG, "1");
      await app.acquireTokenRedirect({ scopes, account });
      return { ok: false, reason: "consent_required" };
    }
  }, []);

  const apiFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (modeRef.current === "entra") {
        const t = await getToken();
        if (t) headers.set("Authorization", `Bearer ${t}`);
      }
      return fetch(path, { ...init, headers, credentials: "same-origin" });
    },
    [getToken],
  );

  const loadMe = useCallback(async () => {
    const res = await apiFetch("/api/me");
    if (res.ok) {
      setUser((await res.json()).user);
      setStatus("authenticated");
    } else if (res.status === 403 && (await res.json().catch(() => ({}))).error === "not_onboarded") {
      setUser(null);
      setStatus("not_onboarded");
    } else if (res.status === 401) {
      setUser(null);
      setStatus("unauthenticated");
    } else {
      setStatus("error");
      setError(`Could not load your session (${res.status})`);
    }
  }, [apiFetch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await (await fetch("/api/auth/config")).json();
        if (cancelled) return;
        modeRef.current = cfg.mode;
        setMode(cfg.mode);
        if (cfg.mode === "demo") {
          setDemoPinRequired(cfg.demoPinRequired === true);
          const p = await fetch("/api/demo/personas");
          if (p.ok) setPersonas((await p.json()).personas);
          else setError((await p.json().catch(() => ({}))).message ?? "Demo sign-in is not available");
        } else {
          const { app } = await bootMsal();
          if (cancelled) return;
          msal.current = app;
          if (!app.getActiveAccount()) {
            setStatus("unauthenticated");
            return;
          }
        }
        await loadMe();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Sign-in failed");
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      mode,
      user,
      error,
      personas,
      demoPinRequired,
      apiFetch,
      acquireGraphToken,
      async signIn() {
        if (modeRef.current === "entra") await msal.current?.loginRedirect(buildLoginRequest());
      },
      async signOut() {
        if (modeRef.current === "demo") {
          await fetch("/api/demo/logout", { method: "POST" });
          setUser(null);
          setStatus("unauthenticated");
        } else {
          const app = msal.current;
          const account = app?.getActiveAccount() ?? app?.getAllAccounts()[0];
          await app?.logoutRedirect(account ? { account } : undefined);
        }
      },
      async switchPersona(userId: string, pin?: string) {
        const r = await fetch("/api/demo/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(pin ? { userId, pin } : { userId }),
        });
        if (!r.ok) {
          setError(r.status === 403 || r.status === 429 ? ((await r.json().catch(() => ({}))).message ?? "Could not switch persona") : "Could not switch persona");
          return;
        }
        setError(null);
        setStatus("loading");
        await loadMe();
      },
    }),
    [status, mode, user, error, personas, demoPinRequired, apiFetch, acquireGraphToken, loadMe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
