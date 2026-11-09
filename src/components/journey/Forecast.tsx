/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { useId } from "react";
import { OverdueBadge, OwnerBadge, StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
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
  const box = cn("rounded-md border border-line bg-card px-[22px] py-5", className);
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
  const [first, ...later] = nextTasks;
  if (remainingCount === 0) {
    return (
      <section aria-labelledby={h} className={box}>
        <h3 id={h} className="sr-only">
          Forecast
        </h3>
        <div className="flex items-center gap-3">
          <img src="/brand/horse-celebrate.svg" alt="" aria-hidden width={48} height={36} className="h-9 w-12" />
          <p className="font-bold">You&apos;re all caught up</p>
        </div>
      </section>
    );
  }
  // The bright green "Next step" feature card: black text, black pill button with an arrow.
  return (
    <section aria-labelledby={h} className={cn("rounded-md border border-feature bg-feature px-[22px] py-5 text-ink", className)}>
      <h3 id={h} className="text-sm font-bold">
        Next step
      </h3>
      <p className="mt-1 text-lg font-bold">
        {remainingCount} {remainingCount === 1 ? "task" : "tasks"} to go
        {projectedFinish && <span className="font-normal"> · Finish about {formatDayMonth(projectedFinish)}</span>}
      </p>
      {anyOverdue && <p className="text-sm">Some tasks are overdue, so the finish date may move.</p>}
      {first && (
        <div className="mt-3">
          <p className="text-[17px] font-bold leading-snug">{first.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
            Due {formatShortDate(first.dueDate)}
            {first.overdue && <OverdueBadge />}
            {first.status === "BLOCKED" && <StatusBadge status="BLOCKED" />}
            <OwnerBadge owner={first.owner} viewerIsStarter={viewerIsStarter} />
          </p>
          <ButtonLink
            href={first.href}
            className="mt-3"
            aria-label={`Open ${first.title}, due ${formatLongDate(first.dueDate)}${first.overdue ? ", overdue" : ""}${first.status === "BLOCKED" ? ", blocked" : ""}`}
          >
            Open
            <ArrowRight aria-hidden className="size-5" strokeWidth={1.8} />
          </ButtonLink>
        </div>
      )}
      {later.length > 0 && (
        <>
          <p className="mt-4 text-sm font-bold">After that</p>
          <ul aria-label="Next due tasks" className="mt-1 divide-y divide-ink/20">
            {later.map((t) => (
              <li key={t.id}>
                <Link
                  href={t.href}
                  className="flex min-h-11 items-center gap-2 py-2"
                  aria-label={`${t.title}, due ${formatLongDate(t.dueDate)}${t.overdue ? ", overdue" : ""}${t.status === "BLOCKED" ? ", blocked" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{t.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-sm">
                      Due {formatShortDate(t.dueDate)}
                      {t.overdue && <OverdueBadge />}
                      {t.status === "BLOCKED" && <StatusBadge status="BLOCKED" />}
                      <OwnerBadge owner={t.owner} viewerIsStarter={viewerIsStarter} />
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0" strokeWidth={1.8} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
