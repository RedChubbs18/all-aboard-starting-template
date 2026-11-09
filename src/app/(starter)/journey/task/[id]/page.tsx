"use client";

import { use, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/client";
import { nextActionableTask } from "@/components/journey/derive";
import type { JourneyResponse } from "@/components/journey/types";
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
  const router = useRouter();
  const { apiFetch } = useSession();
  const opened = useRef<string | null>(null);

  // F4: reading/info tasks complete when the colleague opens them (once per visit).
  const t = data?.task;
  const eligible = !!t && t.autoCompleteOnOpen && t.canAct && data!.journey.viewerIsStarter && (t.status === "TODO" || t.status === "IN_PROGRESS");
  useEffect(() => {
    if (!eligible || !t || opened.current === t.id) return;
    opened.current = t.id;
    void (async () => {
      const r = await apiFetch(`/api/starter/tasks/${t.id}/open`, { method: "POST" });
      if (r.ok && ((await r.json().catch(() => ({}))) as { completed?: boolean }).completed) {
        toast.success(`Marked as read: ${t.title}`);
        reload();
        await journeyStore.reload();
      }
    })();
  }, [eligible, t, apiFetch, toast, reload, journeyStore]);

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
      // F6: move on to the next actionable task (same stage first), or back to the journey.
      let next = null;
      try {
        const res = await apiFetch(`/api/starter/journey?journeyId=${encodeURIComponent(data!.journey.id)}`);
        if (res.ok) next = nextActionableTask(((await res.json()) as JourneyResponse).journey.tasks, data!.task);
      } catch {
        /* fall back to the journey */
      }
      if (next) {
        toast.success(`Done. Next: ${next.title}`);
        router.push(`/journey/task/${next.id}`);
      } else {
        toast.success("Done. Nothing else to do right now.");
        router.push(data!.journey.viewerIsStarter ? "/journey" : `/journey?journeyId=${encodeURIComponent(data!.journey.id)}`);
      }
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
