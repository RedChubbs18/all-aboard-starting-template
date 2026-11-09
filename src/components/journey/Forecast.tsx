/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useId } from "react";
import { OverdueBadge, OwnerBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import type { JourneyView } from "./derive";
import { formatDayMonth, formatLongDate, formatShortDate } from "./format";

interface Props {
  view: Pick<JourneyView, "remainingCount" | "nextTasks" | "projectedFinish">;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  viewerIsStarter?: boolean;
  className?: string;
}

/** FR-1.4 forecast: remaining count, next due tasks and projected finish. Text, not just colour. */
export function Forecast({ view, loading, error, onRetry, viewerIsStarter = true, className }: Props) {
  const h = useId();
  const box = cn("rounded-lg bg-surface p-4 shadow-card", className);
  if (loading) {
    return (
      <section aria-busy="true" aria-label="Loading forecast" className={cn(box, "space-y-2")}>
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </section>
    );
  }
  if (error) {
    return (
      <section aria-labelledby={h} className={box}>
        <h3 id={h} className="sr-only">
          Forecast
        </h3>
        <Alert tone="danger" live="alert">
          <p>Couldn&apos;t load your forecast.</p>
          {onRetry && (
            <Button variant="secondary" className="mt-2" onClick={onRetry}>
              Retry
            </Button>
          )}
        </Alert>
      </section>
    );
  }
  const { remainingCount, nextTasks, projectedFinish } = view;
  const anyOverdue = nextTasks.some((t) => t.overdue);
  return (
    <section aria-labelledby={h} className={box}>
      <h3 id={h} className="text-sm font-semibold uppercase tracking-wide text-text-muted">
        Forecast
      </h3>
      {remainingCount === 0 ? (
        <div className="mt-2 flex items-center gap-3">
          <img src="/brand/horse-celebrate.svg" alt="" aria-hidden width={48} height={36} className="h-9 w-12" />
          <p className="font-semibold">You&apos;re all caught up</p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-lg font-semibold">
            {remainingCount} {remainingCount === 1 ? "task" : "tasks"} to go
            {projectedFinish && <span className="font-normal text-text-muted"> · Finish about {formatDayMonth(projectedFinish)}</span>}
          </p>
          {anyOverdue && <p className="text-sm text-warning">Some tasks are overdue, so the finish date may move.</p>}
          {nextTasks.length > 0 && (
            <>
              <p className="mt-3 text-sm font-semibold">Next up</p>
              <ul aria-label="Next due tasks" className="mt-1 divide-y divide-border/40">
                {nextTasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={t.href}
                      className="flex min-h-11 items-center gap-2 rounded-md py-2 hover:bg-brand-soft"
                      aria-label={`${t.title}, due ${formatLongDate(t.dueDate)}${t.overdue ? ", overdue" : ""}${t.status === "BLOCKED" ? ", blocked" : ""}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{t.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-sm text-text-muted">
                          due {formatShortDate(t.dueDate)}
                          {t.overdue && <OverdueBadge />}
                          {t.status === "BLOCKED" && <StatusBadge status="BLOCKED" />}
                          <OwnerBadge owner={t.owner} viewerIsStarter={viewerIsStarter} />
                        </span>
                      </span>
                      <ChevronRight aria-hidden className="size-5 shrink-0 text-text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
