"use client";

import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { useApi } from "@/lib/auth/use-api";
import { Alert } from "@/components/admin/common";

interface Overview {
  templates: number;
  content: number;
  faqs: number;
  users: number;
  teams: number;
  journeys: number;
  adapters: { key: string; mode: string }[];
}

export default function Page() {
  const { data, error, loading } = useApi<Overview>("/api/admin/overview");
  const real = data?.adapters.filter((a) => a.mode === "REAL").length ?? 0;
  const cards = data
    ? [
        { href: "/admin/templates", label: "Task templates", value: data.templates },
        { href: "/admin/content", label: "Content items", value: data.content },
        { href: "/admin/content", label: "FAQs", value: data.faqs },
        { href: "/admin/teams", label: "People", value: data.users },
        { href: "/admin/teams", label: "Teams", value: data.teams },
        { href: "/admin/journeys", label: "Journeys", value: data.journeys },
        { href: "/admin/adapters", label: "Adapters in REAL mode", value: `${real} of ${data.adapters.length}` },
      ]
    : [];
  return (
    <div className="space-y-4">
      {loading && <p role="status" className="text-muted">Loading…</p>}
      {error && <Alert kind="danger">{error}</Alert>}
      <p>
        <ButtonLink href="/admin/seed">
          Seed a new starter
        </ButtonLink>
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <li key={c.label}>
            <Link href={c.href} className="block min-h-11 rounded-md border border-line bg-card px-[22px] py-4 hover:bg-page">
              <span className="block text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-ink">{c.value}</span>
              <span className="text-muted">{c.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p>
        <Link href="/admin/simulate" className="font-semibold text-brand-strong underline underline-offset-2">Simulate integration events (demo tools)</Link>
      </p>
    </div>
  );
}
