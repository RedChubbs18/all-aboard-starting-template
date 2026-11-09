"use client";

import { useSession } from "@/lib/auth/client";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Button } from "@/components/ui/Button";

export function NotOnboarded() {
  const { signOut } = useSession();
  return (
    <section aria-labelledby="no-h" className="mx-auto w-full max-w-[420px] rounded-lg border border-line bg-card px-7 py-9">
      <BrandLogo className="mb-7" />
      <h1 id="no-h" className="text-[28px] font-bold leading-tight">You are not onboarded yet</h1>
      <p className="mt-2 text-muted">
        You are signed in, but we do not have an onboarding journey set up for this account yet. This is normal if your
        manager has not registered you. Please contact your People &amp; Places team or line manager and try again later.
      </p>
      <Button variant="secondary" onClick={() => void signOut()} className="mt-5">
        Sign out
      </Button>
    </section>
  );
}
