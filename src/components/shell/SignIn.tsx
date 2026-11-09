"use client";

import { useSession } from "@/lib/auth/client";

/** Signed-out view: persona switcher (demo mode) or Microsoft sign-in (Entra mode). */
export function SignIn() {
  const { mode, personas, switchPersona, signIn, error } = useSession();
  return (
    <section aria-labelledby="signin-h" className="rounded-lg bg-surface p-6 shadow-card">
      <h1 id="signin-h" className="text-2xl font-semibold text-brand-strong">Welcome aboard</h1>
      {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
      {mode === "demo" ? (
        <>
          <p className="mt-2 text-text-muted">Demo mode: choose who you want to be.</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {personas.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => switchPersona(p.id)}
                  className="min-h-12 w-full rounded-md border border-border bg-surface px-3 py-2 text-left hover:bg-brand-soft"
                >
                  <span className="block font-medium">{p.displayName}</span>
                  <span className="block text-sm text-text-muted">{p.roles.join(", ") || "Team member"}{p.teamName ? ` · ${p.teamName}` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="mt-2 text-text-muted">Sign in with your Microsoft account to see your journey.</p>
          <button onClick={signIn} className="mt-4 min-h-12 rounded-md bg-brand px-5 font-medium text-surface hover:bg-brand-strong">
            Sign in with Microsoft
          </button>
        </>
      )}
    </section>
  );
}
