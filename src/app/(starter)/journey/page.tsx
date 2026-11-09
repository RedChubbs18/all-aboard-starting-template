"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth/client";
import { BuddyView } from "@/components/journey/BuddyView";
import { RoleGate } from "@/components/shell/RoleGate";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { HorseTrack } from "@/components/journey/HorseTrack";
import { JourneyView } from "@/components/journey/JourneyView";
import { deriveView } from "@/components/journey/derive";
import { useJourney } from "@/components/journey/use-journey";
import type { TaskDto } from "@/components/journey/types";

function JourneySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <HorseTrack loading stages={deriveView({ tasks: [], currentStage: "CONDITIONAL_OFFER", status: "active" }).stages} progress={0} remainingCount={0} nextTasks={[]} projectedFinish={null} completed={false} />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

/** F15: buddies get their own view; the chosen starter is remembered in the URL (`?journeyId=`). */
function BuddyPage() {
  const params = useSearchParams();
  const router = useRouter();
  return (
    <div className="space-y-4">
      <OfflineBanner />
      <BuddyView journeyId={params.get("journeyId")} onSelect={(id) => router.replace(`/journey?journeyId=${encodeURIComponent(id)}`)} />
    </div>
  );
}

function JourneyPage() {
  const params = useSearchParams();
  const { user } = useSession();
  const buddyOnly = !!user && user.roles.includes("BUDDY") && !user.roles.some((r) => ["STARTER", "LM", "PNP", "ADMIN"].includes(r));
  if (buddyOnly) return <BuddyPage />;
  return <StarterJourney journeyId={params.get("journeyId")} />;
}

function StarterJourney({ journeyId }: { journeyId: string | null }) {
  const { data, error, loading, reload, complete, pendingId, lastCompletedTitle } = useJourney(journeyId);
  const toast = useToast();

  async function onComplete(task: TaskDto) {
    const r = await complete(task.id);
    // Success is announced once, by the journey track's live region (progress and next step), and shown by the tick and marker.
    if (!r.ok) toast.error(r.error ?? "Couldn't save that. Please try again.");
  }

  if (loading) return <JourneySkeleton />;
  if (error && !data) {
    const none = /no journey/i.test(error);
    return none ? (
      <EmptyState title="No journey to show yet">Your onboarding journey will appear here once your manager has set it up.</EmptyState>
    ) : (
      <Alert tone="danger" live="alert" title="Couldn't load your journey">
        <p>{error}</p>
        <Button variant="secondary" className="mt-2" onClick={() => void reload()}>
          Retry
        </Button>
      </Alert>
    );
  }
  if (!data) return <JourneySkeleton />;

  const { journey } = data;
  return (
    <div className="space-y-4">
      <OfflineBanner />
      <h1 className="sr-only">
        {journey.viewerIsStarter ? "Your journey" : `${journey.starter.name}'s journey`}
      </h1>
      <JourneyView data={data} onComplete={onComplete} pendingId={pendingId} lastCompletedTitle={lastCompletedTitle} onWithdrawn={() => void reload()} />
    </div>
  );
}

export default function Page() {
  return (
    <RoleGate roles={["STARTER", "BUDDY", "LM", "PNP", "ADMIN"]}>
      <Suspense fallback={<JourneySkeleton />}>
        <JourneyPage />
      </Suspense>
    </RoleGate>
  );
}
