"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RoleGate } from "@/components/shell/RoleGate";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { GoalsPanel, type GoalItem } from "@/components/journey/GoalsPanel";
import { useApi } from "@/lib/auth/use-api";

interface GoalsResponse {
  journeyId: string;
  canEdit: boolean;
  lockedUntil?: string | null;
  goals: GoalItem[];
}

function GoalsPage() {
  const journeyId = useSearchParams().get("journeyId");
  const { data, error, loading, reload } = useApi<GoalsResponse>(`/api/starter/goals${journeyId ? `?journeyId=${encodeURIComponent(journeyId)}` : ""}`);
  return (
    <div className="mx-auto max-w-[640px] space-y-4">
      <Link href={journeyId ? `/journey?journeyId=${encodeURIComponent(journeyId)}` : "/journey"} className="inline-flex min-h-11 items-center text-brand-strong underline underline-offset-2">
        Back to journey
      </Link>
      <h1 className="text-[1.75rem] font-bold leading-tight text-ink">30-60-90 day goals</h1>
      <p className="text-muted">Agree a few simple goals with your line manager. Use plain language and keep personal details out.</p>
      {loading && (
        <div aria-busy="true" className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}
      {error && (
        <Alert tone="danger" live="alert" title="Couldn't load goals">
          <p>{error}</p>
          <Button variant="secondary" className="mt-2" onClick={reload}>
            Retry
          </Button>
        </Alert>
      )}
      {data && <GoalsPanel journeyId={data.journeyId} goals={data.goals} canEdit={data.canEdit} lockedUntil={data.lockedUntil} onChanged={reload} />}
    </div>
  );
}

export default function Page() {
  return (
    <RoleGate roles={["STARTER", "BUDDY", "LM", "PNP", "ADMIN"]}>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <GoalsPage />
      </Suspense>
    </RoleGate>
  );
}
