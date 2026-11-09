"use client";

import { useSession } from "@/lib/auth/client";

export function NotOnboarded() {
  const { signOut } = useSession();
  return (
    <section aria-labelledby="no-h" className="rounded-lg bg-surface p-6 shadow-card">
      <h1 id="no-h" className="text-2xl font-semibold text-brand-strong">You are not onboarded yet</h1>
      <p className="mt-2 text-text-muted">
        You are signed in, but we do not have an onboarding journey set up for this account yet. This is normal if your
        manager has not registered you. Please contact your People &amp; Places team or line manager and try again later.
      </p>
      <button onClick={signOut} className="mt-4 min-h-12 rounded-md border border-border px-5 font-medium hover:bg-surface-alt">
        Sign out
      </button>
    </section>
  );
}
