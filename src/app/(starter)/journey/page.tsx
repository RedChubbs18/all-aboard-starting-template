"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
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

function JourneyPage() {
  const params = useSearchParams();
  const journeyId = params.get("journeyId");
  const { data, error, loading, reload, complete, pendingId, lastCompletedTitle } = useJourney(journeyId);
  const toast = useToast();

  async function onComplete(task: TaskDto) {
    const r = await complete(task.id);
    if (r.ok) toast.success(`Task done: ${task.title}`);
    else toast.error(r.error ?? "Couldn't save that. Please try again.");
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
