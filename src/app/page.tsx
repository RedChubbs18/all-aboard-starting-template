"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/auth/client";
import { homePathFor } from "@/lib/auth/roles";
import { NotOnboarded } from "@/components/shell/NotOnboarded";
import { SignIn } from "@/components/shell/SignIn";

export default function Home() {
  const { status, user } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status === "authenticated" && user) router.replace(homePathFor(user));
  }, [status, user, router]);
  if (status === "loading" || status === "authenticated") return <p role="status" className="text-muted">Loading…</p>;
  if (status === "not_onboarded") return <NotOnboarded />;
  return <SignIn />;
}
