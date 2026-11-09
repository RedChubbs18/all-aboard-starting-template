"use client";

import { use } from "react";
import { RoleGate } from "@/components/shell/RoleGate";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { TaskDetailResponse } from "@/components/journey/detail-types";
import { TaskDetailView } from "@/components/journey/task-detail/TaskDetailView";
import { useJourney } from "@/components/journey/use-journey";
import { useApi } from "@/lib/auth/use-api";

function TaskPage({ id }: { id: string }) {
  const { data, error, loading, reload } = useApi<TaskDetailResponse>(`/api/starter/tasks/${id}`);
  const journeyStore = useJourney(data?.journey.id ?? null);
  const toast = useToast();

  if (loading) {
    return (
      <div className="mx-auto max-w-[640px] space-y-3" aria-busy="true">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Alert tone="danger" live="alert" title="Couldn't load this task">
        <p>{error ?? "Something went wrong."}</p>
        <Button variant="secondary" className="mt-2" onClick={reload}>
          Retry
        </Button>
      </Alert>
    );
  }

  async function onComplete() {
    const r = await journeyStore.complete(data!.task.id);
    if (r.ok) {
      toast.success(`Task done: ${data!.task.title}`);
      reload();
    } else toast.error(r.error ?? "Couldn't save that. Please try again.");
  }

  return (
    <TaskDetailView
      data={data}
      onChanged={async () => {
        reload();
        await journeyStore.reload();
      }}
      onComplete={onComplete}
      completing={journeyStore.pendingId === data.task.id}
    />
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RoleGate roles={["STARTER", "BUDDY", "LM", "PNP", "ADMIN"]}>
      <TaskPage id={id} />
    </RoleGate>
  );
}
