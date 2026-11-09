"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { Owner, Stage } from "@/domain/types";
import { cn } from "@/components/ui/cn";
import { StageHeader } from "@/components/ui/StageHeader";
import { Alert } from "@/components/ui/Alert";
import { ContactCard } from "@/components/ui/ContactCard";
import { TaskList } from "./TaskList";
import type { TrackStage } from "./derive";
import type { JourneyDto, TaskDto } from "./types";

const FA_LABEL: Record<NonNullable<JourneyDto["firstadvantage"]>["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  action_needed: "Action needed",
  cleared: "Cleared",
  failed: "There is an issue",
};

interface Props {
  stages: TrackStage[];
  journey: Pick<JourneyDto, "tasks" | "firstadvantage" | "pnp" | "viewerIsStarter">;
  readOnly?: boolean;
  highlightOwner?: Owner;
  /** Stage to expand and scroll to (milestone tap). Changing `openRequest.n` re-triggers. */
  openRequest?: { stage: Stage; n: number } | null;
  now?: Date;
  onComplete?: (task: TaskDto) => void;
  pendingId?: string | null;
}

/** Stage accordion: the current stage is open by default; locked stages explain what unlocks them. */
export function StageAccordion({ stages, journey, readOnly, highlightOwner, openRequest, now, onComplete, pendingId }: Props) {
  const current = stages.find((s) => s.state === "current")?.key ?? stages[stages.length - 1]?.key;
  // Explicit user choices; otherwise the current stage is open and the rest are closed.
  const [overrides, setOverrides] = useState<Partial<Record<Stage, boolean>>>({});
  const [seen, setSeen] = useState(0);
  if (openRequest && openRequest.n !== seen) {
    setSeen(openRequest.n);
    setOverrides((o) => ({ ...o, [openRequest.stage]: true }));
  }
  const isLocked = (k: Stage) => stages.find((s) => s.key === k)?.state === "locked";
  const isOpen = (k: Stage) => !isLocked(k) && (overrides[k] ?? k === current);

  useEffect(() => {
    if (!openRequest) return;
    requestAnimationFrame(() => document.getElementById(`stage-${openRequest.stage}-btn`)?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
  }, [openRequest]);

  const toggle = (k: Stage) => !isLocked(k) && setOverrides((o) => ({ ...o, [k]: !(o[k] ?? k === current) }));

  return (
    <div className="space-y-3.5">
      {stages.map((s, i) => {
        const id = `stage-${s.key}`;
        const expanded = isOpen(s.key);
        const vetting = s.key === "PEV";
        // F7: the First Advantage status leads the vetting stage.
        const faFirst = (t: TaskDto) => (t.adapterKey === "firstadvantage" && t.type === "INTEGRATION_STATUS" ? 0 : 1);
        const tasks = journey.tasks.filter((t) => t.stage === s.key).sort((a, b) => (vetting ? faFirst(a) - faFirst(b) : 0));
        const faTask = vetting ? tasks.find((t) => faFirst(t) === 0) : undefined;
        return (
          <section key={s.key} className={cn("overflow-hidden rounded-md border border-line bg-card", s.state === "locked" && "opacity-55")}>
            <StageHeader
              number={i + 1}
              label={s.label}
              state={s.state}
              doneCount={s.doneCount}
              totalCount={s.totalCount}
              unlockHint={s.unlockHint}
              expanded={expanded}
              controlsId={id}
              onToggle={() => toggle(s.key)}
            />
            <div id={id} role="region" aria-labelledby={`${id}-btn`} hidden={!expanded} className="space-y-3 border-t border-line pt-3">
              <p className="px-4 text-sm text-muted">{s.description}</p>
              {faTask && journey.firstadvantage && s.state !== "locked" && (
                <Link href={`/journey/task/${faTask.id}`} className="mx-4 flex min-h-14 items-center gap-3 rounded-md border border-line bg-page p-3">
                  <ShieldCheck aria-hidden className="size-6 shrink-0 text-brand-strong" strokeWidth={1.8} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-muted">First Advantage status</span>
                    <span className="block font-semibold">{FA_LABEL[journey.firstadvantage.status]}</span>
                  </span>
                </Link>
              )}
              {vetting && journey.firstadvantage && (journey.firstadvantage.status === "action_needed" || journey.firstadvantage.status === "failed") && (
                <Alert className="mx-4" tone={journey.firstadvantage.status === "failed" ? "danger" : "warning"} title="Action needed on your vetting">
                  <p>Your First Advantage check needs attention. Open the vetting task for what to do next.</p>
                </Alert>
              )}
              {vetting && journey.pnp && s.state !== "locked" && (
                <ContactCard name={journey.pnp.name} role="People & Places (vetting support)" upn={journey.pnp.upn} photoUrl={journey.pnp.photoUrl} variant="compact" className="mx-4" />
              )}
              <TaskList
                tasks={tasks}
                label={`${s.label} tasks`}
                readOnly={readOnly}
                highlightOwner={highlightOwner}
                viewerIsStarter={journey.viewerIsStarter}
                now={now}
                onComplete={onComplete}
                pendingId={pendingId}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
