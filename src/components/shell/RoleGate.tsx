"use client";

import { useSession } from "@/lib/auth/client";
import { hasAnyRole, type Role } from "@/lib/auth/roles";
import { NotOnboarded } from "./NotOnboarded";
import { SignIn } from "./SignIn";

/**
 * Client-side page guard. Renders children only for signed-in users holding one of `roles`.
 * This is UX only: every API route re-checks the role on the server (withRole).
 * In Entra mode the identity is a bearer token, so pages load data client-side via useApi().
 */
export function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { status, user, error } = useSession();
  if (status === "loading") return <p role="status" className="text-muted">Loading…</p>;
  if (status === "error") return <p role="alert" className="text-blocked">{error ?? "Something went wrong."}</p>;
  if (status === "not_onboarded") return <NotOnboarded />;
  if (status === "unauthenticated" || !user) return <SignIn />;
  if (!hasAnyRole(user, ...roles)) {
    return (
      <section role="alert" className="rounded-lg bg-card p-6 border border-line">
        <h1 className="text-xl font-bold text-blocked">No access</h1>
        <p className="mt-2 text-muted">Your role ({user.roles.join(", ") || "none"}) cannot view this page.</p>
      </section>
    );
  }
  return <>{children}</>;
}
