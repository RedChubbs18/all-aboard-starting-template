"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PublicClientApplication } from "@azure/msal-browser";
import { LOGIN_SCOPES, getMsalConfig } from "./config";
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
  /** fetch() that authenticates the call (bearer token in Entra mode, cookie in demo mode). */
  apiFetch(path: string, init?: RequestInit): Promise<Response>;
}

const Ctx = createContext<SessionValue | null>(null);

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
      return r.idToken;
    } catch {
      await app.acquireTokenRedirect({ scopes: LOGIN_SCOPES, account });
      return null;
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
          const { PublicClientApplication } = await import("@azure/msal-browser");
          const app = new PublicClientApplication(getMsalConfig());
          await app.initialize();
          const redirect = await app.handleRedirectPromise();
          if (redirect?.account) app.setActiveAccount(redirect.account);
          else if (app.getAllAccounts()[0]) app.setActiveAccount(app.getAllAccounts()[0]);
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
      async signIn() {
        if (modeRef.current === "entra") await msal.current?.loginRedirect({ scopes: LOGIN_SCOPES });
      },
      async signOut() {
        if (modeRef.current === "demo") {
          await fetch("/api/demo/logout", { method: "POST" });
          setUser(null);
          setStatus("unauthenticated");
        } else {
          await msal.current?.logoutRedirect();
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
    [status, mode, user, error, personas, demoPinRequired, apiFetch, loadMe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
