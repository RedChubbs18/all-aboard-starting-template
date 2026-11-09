"use client";

import { MessageCircle } from "lucide-react";
import { useId, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { controlClass } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/lib/auth/client";
import { useApi } from "@/lib/auth/use-api";
import { chatLink } from "@/lib/teams";
import { STAGE_META } from "./derive";
import type { BuddyResponse, BuddyStarterDto } from "./buddy-types";
import { TaskList } from "./TaskList";
import type { TaskDto } from "./types";

function StarterSummary({ s }: { s: BuddyStarterDto }) {
  return (
    <Card as="section" aria-label={`${s.name} summary`} className="space-y-3">
      <div>
        <h2 className="text-lg font-bold">{s.name}</h2>
        <p className="text-sm text-muted">
          {s.status === "exited" ? "Withdrew from onboarding" : s.status === "completed" ? "Onboarding complete" : `Stage: ${STAGE_META[s.stage].label}`}
        </p>
      </div>
      <ProgressBar value={s.progressPercent} label={`${s.name}'s onboarding progress`} />
      <p className="tabular text-sm font-semibold">{s.progressPercent}% complete</p>
      {s.upn && (
        <ButtonLink href={chatLink(s.upn)} external variant="secondary" className="w-full">
          <MessageCircle aria-hidden className="size-5" />
          Chat with {s.name.split(" ")[0]} on Teams
          <span className="sr-only"> (opens in a new tab)</span>
        </ButtonLink>
      )}
    </Card>
  );
}

/** F15 / F16 / D22: the buddy's home. Summary, own tasks, a switcher for 2+ starters, and read-only past starters. */
export function BuddyView({ journeyId, onSelect }: { journeyId: string | null; onSelect: (id: string) => void }) {
  const { data, error, loading, reload } = useApi<BuddyResponse>(`/api/starter/buddy${journeyId ? `?journeyId=${encodeURIComponent(journeyId)}` : ""}`);
  const { apiFetch } = useSession();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const selectId = useId();

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error || !data) {
    return (
      <Alert tone="danger" live="alert" title="Couldn't load your starters">
        <p>{error ?? "Something went wrong."}</p>
        <Button variant="secondary" className="mt-2" onClick={reload}>
          Retry
        </Button>
      </Alert>
    );
  }
  const active = data.starters.filter((s) => s.status === "active");
  const past = data.starters.filter((s) => s.status !== "active");
  const selected = data.starters.find((s) => s.journeyId === data.selectedId) ?? null;
  if (!selected) {
    return <EmptyState title="No starters yet">When a line manager picks you as a buddy, your starter will appear here.</EmptyState>;
  }
  const readOnly = selected.status !== "active";

  async function complete(task: TaskDto) {
    setPending(task.id);
    const r = await apiFetch(`/api/starter/tasks/${task.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    setPending(null);
    if (r.ok) {
      toast.success(`Task done: ${task.title}`);
      reload();
    } else toast.error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? "Couldn't save that. Please try again.");
  }

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Your starters</h1>
      {data.starters.length > 1 && (
        <div>
          <label htmlFor={selectId} className="text-sm font-semibold">
            Starter
          </label>
          <select id={selectId} className={controlClass} value={selected.journeyId} onChange={(e) => onSelect(e.target.value)}>
            {active.length > 0 && (
              <optgroup label="Current starters">
                {active.map((s) => (
                  <option key={s.journeyId} value={s.journeyId}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
            {past.length > 0 && (
              <optgroup label="Past starters">
                {past.map((s) => (
                  <option key={s.journeyId} value={s.journeyId}>
                    {s.name} (past)
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      )}
      <StarterSummary s={selected} />
      {readOnly && (
        <Alert tone="info" title="Past starter">
          <p>This is a record only. You can&apos;t change anything here.</p>
        </Alert>
      )}
      <section aria-labelledby="buddy-tasks-h" className="overflow-hidden rounded-md border border-line bg-card">
        <h2 id="buddy-tasks-h" className="px-4 pt-4 text-lg font-bold">
          Your tasks for {selected.name.split(" ")[0]}
        </h2>
        <TaskList
          tasks={data.tasks}
          label="Your buddy tasks"
          readOnly={readOnly}
          viewerIsStarter={false}
          onComplete={readOnly ? undefined : complete}
          pendingId={pending}
          emptyText="You have no tasks for this starter right now."
        />
      </section>
    </div>
  );
}
