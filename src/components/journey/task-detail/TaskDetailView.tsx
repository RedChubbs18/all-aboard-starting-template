"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, Info } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { OverdueBadge, OwnerBadge, StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Markdown } from "@/components/ui/Markdown";
import { STAGE_META } from "../derive";
import type { TaskDetailResponse } from "../detail-types";
import { formatLongDate, isOverdue } from "../format";
import { BookingView, ChecklistView, CollectView, Day0View, OrderView, VideoView } from "./ActionViews";
import { PhotoFlow } from "./PhotoFlow";
import { FirstAdvantagePanel, SystemStatus, TrainingList } from "./StatusViews";

interface Props {
  data: TaskDetailResponse;
  onChanged: () => void | Promise<void>;
  onComplete: () => Promise<void>;
  completing: boolean;
}

/** Shell shared by every variant: back link, title, badges, due date, description, body, then the action. */
export function TaskDetailView({ data, onChanged, onComplete, completing }: Props) {
  const { task, detail, content, links, waitingFor, journey } = data;
  const back = journey.viewerIsStarter ? "/journey" : `/journey?journeyId=${encodeURIComponent(journey.id)}`;
  const overdue = task.status !== "DONE" && task.status !== "LOCKED" && isOverdue(task.dueDate, new Date());
  const sub = { data, onChanged, onComplete, completing };
  const locked = task.status === "LOCKED";

  // Generic "mark complete" for tasks with nothing to submit.
  const genericKinds = ["none", "goals", "training", "collect"];
  const showGeneric =
    (genericKinds.includes(detail.kind) || (detail.kind === "day0" && detail.role === "wayfinding")) &&
    task.canAct &&
    (task.status === "TODO" || task.status === "IN_PROGRESS" || task.status === "BLOCKED");

  return (
    <article aria-labelledby="task-h" className="mx-auto max-w-[640px] space-y-4">
      <Link href={back} className="inline-flex min-h-11 items-center gap-1 text-brand-strong underline underline-offset-2">
        <ArrowLeft aria-hidden className="size-5" />
        Back to journey
      </Link>

      <header className="space-y-2">
        <p className="text-sm text-muted">{STAGE_META[task.stage].label}</p>
        <h1 id="task-h" className="text-[28px] font-bold leading-tight text-ink">
          {task.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} />
          <OwnerBadge owner={task.owner} viewerIsStarter={journey.viewerIsStarter} />
          {overdue && <OverdueBadge />}
          <span className="text-sm text-muted">{task.status === "DONE" ? "Done" : `Due ${formatLongDate(task.dueDate)}`}</span>
        </div>
        {task.description && <p>{task.description}</p>}
      </header>

      {locked && (
        <Alert tone="info" title={waitingFor.length ? "Waiting for" : "Not available yet"}>
          {waitingFor.length > 0 ? (
            <ul className="list-disc pl-5">
              {waitingFor.map((w) => (
                <li key={w.key}>{w.title}</li>
              ))}
            </ul>
          ) : (
            <p>{task.lockedReason ?? "This unlocks after an earlier step."}</p>
          )}
          {waitingFor.length > 0 && task.lockedReason && /Unlocks when/.test(task.lockedReason) && <p className="mt-1">{task.lockedReason}</p>}
        </Alert>
      )}
      {task.status === "BLOCKED" && task.blockedReason && (
        <Alert tone="danger" title="This needs attention">
          <p>{task.blockedReason}</p>
        </Alert>
      )}
      {!task.canAct && task.status !== "DONE" && !locked && task.owner !== "SYSTEM" && (
        <Alert tone="info">
          <p className="flex items-start gap-1">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            {journey.viewerIsStarter ? "This task belongs to someone else, so it is for information only." : "You can look at this task but only the owner can change it."}
          </p>
        </Alert>
      )}

      {!locked && (
        <section aria-label="Task" className="space-y-4">
          {detail.kind === "checklist" && <ChecklistView {...sub} />}
          {detail.kind === "booking" && <BookingView {...sub} />}
          {detail.kind === "order" && <OrderView {...sub} />}
          {detail.kind === "collect" && <CollectView {...sub} />}
          {detail.kind === "firstadvantage" && <FirstAdvantagePanel data={data} onChanged={onChanged} />}
          {detail.kind === "system" && <SystemStatus data={data} />}
          {detail.kind === "training" && <TrainingList data={data} />}
          {detail.kind === "video" && <VideoView {...sub} />}
          {detail.kind === "photo" && <PhotoFlow task={task} detail={detail} onChanged={onChanged} />}
          {detail.kind === "day0" && <Day0View {...sub} />}
          {detail.kind === "goals" && (
            <ButtonLink href={journey.viewerIsStarter ? "/journey/goals" : `/journey/goals?journeyId=${encodeURIComponent(journey.id)}`} variant="secondary">
              Open goals
            </ButtonLink>
          )}
        </section>
      )}

      {links.length > 0 && !locked && (
        <ul aria-label="Links" className="space-y-2">
          {links.map((l) => (
            <li key={l.href}>
              <ButtonLink href={l.href} external variant="secondary" className="w-full">
                {l.label}
                <ExternalLink aria-hidden className="size-5" />
                <span className="sr-only"> (opens in a new tab)</span>
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}

      {content && (detail.kind === "checklist" || detail.kind === "video" || detail.kind === "photo" ? (
        <details className="rounded-md border border-line bg-card p-3" open={detail.kind === "photo" ? false : undefined}>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">{content.title}</summary>
          <Markdown source={content.body} />
          <Link href={`/content/${content.slug}`} className="mt-2 inline-flex min-h-11 items-center text-brand-strong underline underline-offset-2">
            Open the full page
          </Link>
        </details>
      ) : (
        <Card as="section" aria-label={content.title}>
          <h2 className="text-lg font-bold">{content.title}</h2>
          <Markdown source={content.body} />
          <Link href={`/content/${content.slug}`} className="mt-2 inline-flex min-h-11 items-center text-brand-strong underline underline-offset-2">
            Open the full page
          </Link>
        </Card>
      ))}

      {task.status === "DONE" && (
        <Alert tone="success" live="status" title="Done">
          {task.completedAt && <p>Completed {formatLongDate(task.completedAt)}.</p>}
        </Alert>
      )}

      {showGeneric && (
        <div className="sticky bottom-[88px] md:bottom-4">
          <Button size="lg" className="w-full" loading={completing} onClick={() => void onComplete()}>
            <CheckCircle2 aria-hidden className="size-5" />
            {detail.kind === "collect" ? "Mark as collected" : "Mark complete"}
          </Button>
        </div>
      )}
    </article>
  );
}
