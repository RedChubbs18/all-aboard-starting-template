"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Owner, Stage } from "@/domain/types";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/components/ui/cn";
import { ContactCard } from "@/components/ui/ContactCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { deriveView } from "./derive";
import { Forecast } from "./Forecast";
import { HorseTrack } from "./HorseTrack";
import { StageAccordion } from "./StageAccordion";
import type { JourneyResponse, TaskDto } from "./types";
import { WithdrawDialog } from "./WithdrawDialog";

export interface JourneyViewProps {
  data: JourneyResponse;
  onComplete?: (task: TaskDto) => void;
  pendingId?: string | null;
  lastCompletedTitle?: string;
  /** Hide every action (LM list previews etc.). Buddies/LMs are otherwise limited by per-task `canAct`. */
  readOnly?: boolean;
  /** Tasks owned by this role get the highlight style (LM view passes "LM"). */
  highlightOwner?: Owner;
  onWithdrawn?: () => void;
  reducedMotion?: boolean;
  now?: Date;
  /** "column" (default) is the 430px phone column; "split" puts forecast and contacts beside the stages on wide screens. */
  layout?: "column" | "split";
}

/** Journey home body: track, forecast, stage accordion, contacts. Used by the starter, buddy and (WS2) LM views. */
export function JourneyView({ data, onComplete, pendingId, lastCompletedTitle, readOnly, highlightOwner, onWithdrawn, reducedMotion, now, layout = "column" }: JourneyViewProps) {
  const { journey, others } = data;
  const view = useMemo(() => deriveView(journey, now ?? new Date()), [journey, now]);
  const [openRequest, setOpenRequest] = useState<{ stage: Stage; n: number } | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const split = layout === "split";
  const viewerIsStarter = journey.viewerIsStarter;
  const first = journey.starter.name.split(" ")[0];
  const hv = journey.hireview;
  const alertText =
    hv && (hv.status === "action_needed" || hv.status === "failed")
      ? "Action needed: your vetting check needs attention. Open Vetting for details."
      : null;

  if (journey.status === "exited" && viewerIsStarter) {
    return (
      <section aria-labelledby="closing-h" className="space-y-4">
        <div className="rounded-lg bg-card p-2 border border-line">
          <EmptyState title="Thank you, and best wishes">
            <span id="closing-h" className="sr-only">
              Journey closed
            </span>
            You&apos;ve withdrawn from onboarding. We&apos;re sorry it hasn&apos;t worked out, and we wish you every success. If anything changes or you have a question,
            People &amp; Places are happy to talk.
          </EmptyState>
        </div>
        {journey.pnp && <ContactCard name={journey.pnp.name} role="People & Places" upn={journey.pnp.upn} photoUrl={journey.pnp.photoUrl} bio={null} variant="compact" />}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {!viewerIsStarter && (
        <Alert tone="info" title={`Viewing ${journey.starter.name}'s journey`}>
          <p>
            {journey.viewerRelation === "BUDDY"
              ? "You're their buddy, so this is read-only apart from tasks assigned to you."
              : "This is read-only apart from tasks you own."}
          </p>
        </Alert>
      )}
      {journey.status === "exited" && <Alert tone="warning" title="This journey has closed">{journey.starter.name} withdrew from onboarding.</Alert>}
      {journey.status === "completed" && <Alert tone="success" title="Onboarding complete">All onboarding tasks are done.</Alert>}
      {alertText && journey.status === "active" && (
        <Alert tone={hv?.status === "failed" ? "danger" : "warning"} title="Action needed on your vetting">
          <p>Your First Advantage check needs attention. Open the vetting stage for what to do, or contact People &amp; Places below.</p>
        </Alert>
      )}

      <div className={split ? "grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : "space-y-4"}>
        <div className="min-w-0 space-y-4">
          <HorseTrack
            title={viewerIsStarter ? "Your onboarding journey" : `${first}'s onboarding journey`}
            stages={view.stages}
            progress={view.progress}
            remainingCount={view.remainingCount}
            nextTasks={view.nextTasks}
            projectedFinish={view.projectedFinish}
            completed={view.completed}
            overdueCount={view.overdueCount}
            lastCompletedTitle={lastCompletedTitle}
            alertText={alertText}
            reducedMotion={reducedMotion}
            onSelectStage={(stage) => setOpenRequest((o) => ({ stage, n: (o?.n ?? 0) + 1 }))}
          />
          <div className={split ? "lg:hidden" : undefined}>
            <Forecast view={view} viewerIsStarter={viewerIsStarter} />
          </div>
          <StageAccordion
            stages={view.stages}
            journey={journey}
            readOnly={readOnly}
            highlightOwner={highlightOwner}
            openRequest={openRequest}
            now={now}
            onComplete={onComplete}
            pendingId={pendingId}
          />
        </div>

        <aside aria-label="Forecast and contacts" className={cn("min-w-0 space-y-4", split && "lg:sticky lg:top-4 lg:self-start")}>
          {split && (
            <div className="hidden lg:block">
              <Forecast view={view} viewerIsStarter={viewerIsStarter} />
            </div>
          )}
          <h2 className="sr-only">Contacts</h2>
          <ContactCard name={journey.lm.name} role="Line manager" subtitle={journey.lm.jobTitle} upn={journey.lm.upn} photoUrl={journey.lm.photoUrl} bio={journey.lm.bio} variant="compact" />
          {journey.buddy ? (
            <ContactCard name={journey.buddy.name} role="Buddy" subtitle={journey.buddy.jobTitle} upn={journey.buddy.upn} photoUrl={journey.buddy.photoUrl} bio={journey.buddy.bio} variant="compact" />
          ) : (
            <p className="rounded-md border border-line bg-card p-3 text-sm text-muted">Your buddy hasn&apos;t been allocated yet. Your line manager will do this soon.</p>
          )}
          {!viewerIsStarter && (
            <ContactCard name={journey.starter.name} role="Starter" upn={journey.starter.upn} photoUrl={journey.starter.photoUrl} bio={null} variant="compact" />
          )}
          <Link href="/team" className="flex min-h-11 items-center text-brand-strong underline underline-offset-2">
            See the whole team
          </Link>
        </aside>
      </div>

      {others.length > 0 && (
        <nav aria-label="Other journeys you can view" className="rounded-lg bg-card p-4 border border-line">
          <h2 className="font-semibold">Other starters</h2>
          <ul className="mt-1">
            {others.map((o) => (
              <li key={o.id}>
                <Link href={`/journey?journeyId=${encodeURIComponent(o.id)}`} className="flex min-h-11 items-center text-brand-strong underline underline-offset-2">
                  {o.starterName}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {viewerIsStarter && journey.status === "active" && (
        <footer className="pt-4 text-center">
          <button type="button" onClick={() => setWithdrawOpen(true)} className="min-h-11 px-3 text-sm text-muted underline underline-offset-2">
            Thinking of not joining?
          </button>
          <WithdrawDialog open={withdrawOpen} onClose={() => setWithdrawOpen(false)} onWithdrawn={() => { setWithdrawOpen(false); onWithdrawn?.(); }} />
        </footer>
      )}
    </div>
  );
}
