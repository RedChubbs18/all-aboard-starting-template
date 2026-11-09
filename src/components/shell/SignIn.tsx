"use client";

import { useSession } from "@/lib/auth/client";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

/** Signed-out view: persona switcher (demo mode) or Microsoft sign-in (Entra mode). STYLE section 16. */
export function SignIn() {
  const { mode, personas, switchPersona, signIn, error } = useSession();
  return (
    <section aria-labelledby="signin-h" className="mx-auto w-full max-w-[420px] rounded-lg border border-line bg-card px-7 py-9">
      <BrandLogo className="mb-7" />
      <h1 id="signin-h" className="text-[30px] font-bold leading-tight">
        Welcome aboard
      </h1>
      {error && (
        <Alert tone="danger" live="alert" className="mt-3">
          {error}
        </Alert>
      )}
      {mode === "demo" ? (
        <>
          <p className="mt-2 text-muted">Demo mode: choose who you want to be.</p>
          <ul className="mt-4 space-y-2">
            {personas.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => switchPersona(p.id)}
                  className="min-h-12 w-full rounded-sm border border-line-strong bg-card px-3.5 py-2 text-left hover:bg-page"
                >
                  <span className="block font-bold">{p.displayName}</span>
                  <span className="block text-sm text-muted">
                    {p.roles.join(", ") || "Team member"}
                    {p.teamName ? ` · ${p.teamName}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="mt-2 text-muted">Sign in with your Microsoft account to see your journey.</p>
          <Button onClick={() => void signIn()} className="mt-5 w-full">
            Sign in with Microsoft
          </Button>
        </>
      )}
    </section>
  );
}
