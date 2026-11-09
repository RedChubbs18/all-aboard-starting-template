"use client";

import Link from "next/link";
import { useState } from "react";
import { STAGES, type Stage } from "@/domain/types";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { useStarterDetail } from "./hooks";
import { BespokeTaskSheet, BuddyPanel, TeamItemSheet, CheckInPanel, Day0Panel, GoalsPanel, PhotoReviewPanel } from "./panels";
import { TaskRow, TeamChecklist, type PanelProps } from "./tasks";
import { LINK_TASK_KEYS } from "./schemas";
import { StarterSwitcher } from "./StarterSwitcher";
import type { StarterDetail } from "./types";
import { Alert, Button, Card, ExternalLink, Icon, ProgressBar, RedFlagBadge, Skeleton, STAGE_HINT, STAGE_LABEL, formatDate } from "./ui";

function Header({ d, onAdd }: { d: StarterDetail; onAdd: () => void }) {
  const hv = d.journey.firstadvantage;
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-[28px] font-bold leading-tight text-ink">{d.starter.displayName}</h1>
          <p className="text-muted">
            {STAGE_LABEL[d.journey.stage]} · Starts {formatDate(d.journey.startDate)}
            {d.journey.status !== "active" && ` · ${d.journey.status}`}
          </p>
        </div>
        {d.journey.redFlag && <RedFlagBadge label={hv === "FAILED" ? "First Advantage: failed" : "First Advantage: action needed"} />}
      </div>
      <ProgressBar percent={d.progress.percent} overdue={d.progress.overdue > 0} label={`${d.progress.done} of ${d.progress.total} tasks done (${d.progress.percent}%)`} />
      {(d.progress.overdue > 0 || d.progress.blocked > 0) && (
        <p className="text-sm font-semibold text-blocked">
          {d.progress.overdue > 0 && `${d.progress.overdue} overdue`}
          {d.progress.overdue > 0 && d.progress.blocked > 0 && " · "}
          {d.progress.blocked > 0 && `${d.progress.blocked} blocked`}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <ExternalLink href={d.starter.chatUrl}>
          <Icon name="chat" /> Chat with {d.starter.displayName.split(" ")[0]}
        </ExternalLink>
        {d.buddy && (
          <ExternalLink href={d.buddy.chatUrl}>
            <Icon name="chat" /> Chat with buddy {d.buddy.displayName.split(" ")[0]}
          </ExternalLink>
        )}
        {d.journey.status === "active" && (
          <Button onClick={onAdd}>
            <Icon name="plus" /> Add bespoke task
          </Button>
        )}
      </div>
    </Card>
  );
}

function StageProgress({ d }: { d: StarterDetail }) {
  return (
    <ol aria-label="Journey stages" className="flex flex-wrap gap-2 text-sm">
      {STAGES.map((s) => {
        const current = s === d.journey.stage;
        const { done, total } = d.progress.perStage[s];
        return (
          <li key={s} aria-current={current ? "step" : undefined} className={`rounded-full border-[1.5px] px-3.5 py-1.5 font-semibold ${current ? "border-dark-green bg-dark-green text-card" : "border-ink bg-card text-ink"}`}>
            {STAGE_LABEL[s]} {done}/{total}
          </li>
        );
      })}
    </ol>
  );
}

/** FR-LM.2: the starter's whole journey by stage. LM-owned tasks are highlighted and actionable; others are read-only. */
function StageList({ d, p }: { d: StarterDetail; p: PanelProps }) {
  return (
    <section aria-labelledby="all-tasks" className="space-y-3">
      <h2 id="all-tasks" className="text-xl font-bold text-ink">
        {d.starter.displayName.split(" ")[0]}&apos;s journey
      </h2>
      <StageProgress d={d} />
      {STAGES.map((s: Stage) => {
        const tasks = d.tasks.filter((t) => t.stage === s).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        const { done, total } = d.progress.perStage[s];
        return (
          <details key={s} open={s === d.journey.stage} className="rounded-md border border-line bg-card">
            <summary className="flex min-h-14 cursor-pointer items-center gap-3 px-4 font-semibold">
              <span className="flex-1">
                <span className="block text-[17px] font-bold">{STAGE_LABEL[s]}</span>
                <span className="block text-sm font-normal text-muted">{STAGE_HINT[s]}</span>
              </span>
              <span className="text-sm font-semibold text-muted">
                {done} of {total} done
              </span>
            </summary>
            <div className="space-y-3 border-t border-line px-4 py-4">
              {tasks.length === 0 ? <p className="text-muted">No tasks in this stage yet.</p> : tasks.map((t) => <TaskRow key={t.id} t={t} p={p} />)}
            </div>
          </details>
        );
      })}
    </section>
  );
}

export function StarterDetailView({ journeyId }: { journeyId: string }) {
  return (
    <ToastProvider>
      <StarterDetailBody journeyId={journeyId} />
    </ToastProvider>
  );
}

function StarterDetailBody({ journeyId }: { journeyId: string }) {
  const { data: d, error, loading, reload, mutate } = useStarterDetail(journeyId);
  const t = useToast();
  const [sheet, setSheet] = useState(false);
  const [teamSheet, setTeamSheet] = useState(false);

  const back = (
    <Link href="/lm" className="inline-flex min-h-11 items-center gap-1 text-brand-strong underline underline-offset-2">
      <span aria-hidden="true">←</span> Your starters
    </Link>
  );

  if (loading && !d)
    return (
      <div className="space-y-4" role="status" aria-label="Loading starter">
        {back}
        <Skeleton className="h-40" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  if (error || !d)
    return (
      <div className="space-y-4">
        {back}
        <Alert tone="danger" title="We couldn't load this starter" role="alert" action={<Button variant="secondary" onClick={reload}>Retry</Button>}>
          {error}
        </Alert>
      </div>
    );

  const p: PanelProps = { d, base: `/api/lm/starters/${journeyId}`, mutate, ok: (m) => t.success(m), fail: (m) => t.error(m) };
  // The team checklist is hidden when there are no TEAM tasks; the recurring-calls tasks then stay in "Your tasks".
  const hasTeam = d.tasks.some((x) => x.source === "TEAM");
  const readOnly = d.journey.status !== "active";
  const mine = d.tasks
    .filter((x) => x.owner === "LM" && (!hasTeam || !LINK_TASK_KEYS.includes(x.key)) && x.source !== "TEAM")
    .sort((a, b) => Number(a.status === "DONE") - Number(b.status === "DONE") || a.dueDate.localeCompare(b.dueDate));
  const overdueMine = mine.filter((x) => x.overdue).length;

  return (
    <div className="space-y-4">
      {back}
      <StarterSwitcher currentId={journeyId} />
      {readOnly && (
        <Alert tone="info" title={`This journey is ${d.journey.status}`} role="status">
          It is kept as a read-only record. You can look, but not change anything.
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="lg:col-span-3">
          <Header d={d} onAdd={() => setSheet(true)} />
        </div>
        {d.journey.redFlag && (
          <div className="lg:col-span-3">
            <Alert tone="danger" title={d.journey.firstadvantage === "FAILED" ? "First Advantage vetting has failed" : "First Advantage vetting needs action"} role="alert">
              P&amp;P are following this up. Please do not discuss vetting details with the starter; point them to the contact on their journey.
            </Alert>
          </div>
        )}

        <section aria-labelledby="your-tasks" className="space-y-3 lg:col-span-2 lg:col-start-1">
          <h2 id="your-tasks" className="text-xl font-bold text-ink">
            Your tasks <span className="text-base font-normal text-muted">({mine.filter((x) => x.status !== "DONE").length} to do)</span>
          </h2>
          {overdueMine > 0 && (
            <Alert tone="warning" title={`${overdueMine} of your tasks ${overdueMine === 1 ? "is" : "are"} overdue`}>
              P&amp;P may send you a nudge about these. Marking them done clears the flag.
            </Alert>
          )}
          {mine.length === 0 ? <p className="text-muted">You have no tasks for this starter.</p> : mine.map((x) => <TaskRow key={x.id} t={x} p={p} />)}
        </section>

        <div className="space-y-4 lg:col-start-3 lg:row-span-4 lg:row-start-3">
          <PhotoReviewPanel {...p} />
          <BuddyPanel {...p} />
          <CheckInPanel {...p} />
          <Day0Panel {...p} />
          <GoalsPanel {...p} />
        </div>

        <div className="space-y-4 lg:col-span-2 lg:col-start-1">
          <TeamChecklist p={p} onAdd={() => setTeamSheet(true)} />
          <StageList d={d} p={p} />
        </div>
      </div>
      <TeamItemSheet {...p} open={teamSheet} onClose={() => setTeamSheet(false)} />
      <BespokeTaskSheet {...p} open={sheet} onClose={() => setSheet(false)} />
    </div>
  );
}
