"use client";

import { RoleGate } from "@/components/shell/RoleGate";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ContactCard } from "@/components/ui/ContactCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSession } from "@/lib/auth/client";
import { useApi } from "@/lib/auth/use-api";
import type { TeamMemberDto } from "../../api/starter/team/route";

interface TeamResponse {
  team: { id: string; name: string; area: string | null } | null;
  starter: { id: string } | null;
  members: TeamMemberDto[];
}

function roleLine(m: TeamMemberDto): string {
  if (m.isLm) return "Line manager";
  if (m.isBuddy) return "Buddy";
  return m.teamRole ?? "Team member";
}

function TeamPage() {
  const { user } = useSession();
  const { data, error, loading, reload } = useApi<TeamResponse>("/api/starter/team");

  if (loading) {
    return (
      <div aria-busy="true" className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Alert tone="danger" live="alert" title="Couldn't load your team">
        <p>{error}</p>
        <Button variant="secondary" className="mt-2" onClick={reload}>
          Retry
        </Button>
      </Alert>
    );
  }
  if (!data.team || data.members.length === 0) {
    return <EmptyState title="Welcome to the team">Your team details will appear here once your manager confirms them.</EmptyState>;
  }

  const lm = data.members.find((m) => m.isLm);
  const buddy = data.members.find((m) => m.isBuddy);
  const pinned = [lm, buddy].filter((m): m is TeamMemberDto => !!m);
  const rest = data.members.filter((m) => !pinned.includes(m));
  const starterName = data.starter?.id === user?.id ? user?.displayName : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight text-ink">Welcome to the team</h1>
        <p className="text-muted">{data.team.name}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
      <div className="min-w-0 space-y-6">
      <section aria-labelledby="line-h" className="rounded-md border border-line bg-card px-[22px] py-5">
        <h2 id="line-h" className="font-semibold">
          Reporting line
        </h2>
        <ol className="mt-1 list-none space-y-0.5">
          {lm && <li>{lm.name} (line manager)</li>}
          {starterName && (
            <li className="pl-4">
              {starterName} (you)
              <span className="sr-only">, reports to {lm?.name ?? "your line manager"}</span>
            </li>
          )}
        </ol>
        {!lm && <p className="text-muted">Your line manager will appear here once confirmed.</p>}
      </section>

        <section aria-labelledby="pinned-h" className="space-y-3">
          <h2 id="pinned-h" className="text-lg font-bold">
            Your first contacts
          </h2>
          {pinned.map((m) => (
            <ContactCard key={m.id} name={m.name} role={roleLine(m)} subtitle={m.jobTitle} upn={m.upn} photoUrl={m.photoUrl} bio={m.bio} />
          ))}
          {!buddy && <p className="rounded-md bg-card p-3 text-sm text-muted border border-line">Your buddy hasn&apos;t been allocated yet.</p>}
        </section>
      </div>

        <section aria-labelledby="members-h" className="min-w-0 space-y-3">
          <h2 id="members-h" className="text-lg font-bold">
            The team ({data.members.length})
          </h2>
          <ul className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {rest.map((m) => (
              <li key={m.id}>
                <ContactCard name={m.name} role={roleLine(m)} subtitle={[m.jobTitle, m.reportsToName ? `Reports to ${m.reportsToName}` : null].filter(Boolean).join(" · ")} upn={m.upn} photoUrl={m.photoUrl} bio={m.bio} />
              </li>
            ))}
            {rest.length === 0 && <li className="text-muted">You have met everyone already.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <RoleGate roles={["STARTER", "BUDDY", "LM", "PNP", "ADMIN"]}>
      <TeamPage />
    </RoleGate>
  );
}
