"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Stage } from "@/domain/types";
import { BRAND } from "@/lib/brand";
import { displayPercent, describeChange, type ForecastTask, type TrackStage } from "./derive";

export interface HorseTrackProps {
  /** Exactly 5, in order. */
  stages: TrackStage[];
  /** 0..1, from deriveView (single source of truth). */
  progress: number;
  remainingCount: number;
  nextTasks: ForecastTask[];
  projectedFinish: string | null;
  completed: boolean;
  /** Overdue task count, shown in the compact variant. */
  overdueCount?: number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Kept for callers; the stage cards below the track handle stage selection. */
  onSelectStage?: (key: Stage) => void;
  /** Override; defaults to the user's prefers-reduced-motion setting. */
  reducedMotion?: boolean;
  variant?: "full" | "compact";
  /** Heading text. LM view passes e.g. "Alex's journey". */
  title?: string;
  /** Title of the task just completed, for the live announcement. */
  lastCompletedTitle?: string;
  /** Rendered as a separate role="alert" (vetting needs attention, journey blocked). */
  alertText?: string | null;
  className?: string;
}

const currentNumber = (stages: TrackStage[], completed: boolean) => {
  if (completed) return stages.length;
  const i = stages.findIndex((s) => s.state === "current");
  return i === -1 ? stages.length : i + 1;
};

/** Follows the user's "Accessibility and display" setting (data-motion on <html>), falling back to the OS preference. */
export function useReducedMotion(override?: boolean): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const update = () => {
      const pref = root.getAttribute("data-motion");
      setReduced(pref === "reduce" ? true : pref === "full" ? false : mq.matches);
    };
    update();
    mq.addEventListener?.("change", update);
    const obs = typeof MutationObserver === "function" ? new MutationObserver(update) : null;
    obs?.observe(root, { attributes: true, attributeFilter: ["data-motion"] });
    return () => {
      mq.removeEventListener?.("change", update);
      obs?.disconnect();
    };
  }, []);
  return override ?? reduced;
}

export function HorseTrack(props: HorseTrackProps) {
  const {
    stages,
    progress,
    remainingCount,
    nextTasks,
    completed,
    overdueCount = 0,
    loading,
    error,
    onRetry,
    variant = "full",
    title = "Your onboarding journey",
    lastCompletedTitle,
    alertText,
    className,
  } = props;
  const headingId = useId();
  const reduced = useReducedMotion(props.reducedMotion);

  const percent = displayPercent(progress, completed);
  const stageNumber = currentNumber(stages, completed);
  const stage = stages[Math.max(0, stageNumber - 1)];
  const doneTotal = stages.reduce((n, s) => n + s.doneCount, 0);
  const taskTotal = stages.reduce((n, s) => n + s.totalCount, 0);
  const valueText = `${percent} percent complete. Stage ${stageNumber} of 5: ${stage?.label ?? ""}. ${doneTotal} of ${taskTotal} tasks done.`;

  const prev = useRef({ progress, percent, remainingCount, nextTasks, stages, completed, stageNumber });

  // --- live region: one per page, silent on first render, debounced 400ms
  const [live, setLive] = useState("");
  const first = useRef(true);
  useEffect(() => {
    const before = prev.current;
    prev.current = { progress, percent, remainingCount, nextTasks, stages, completed, stageNumber };
    if (first.current) {
      first.current = false;
      return;
    }
    const msg = describeChange(
      {
        stages: before.stages,
        progress: before.progress,
        percent: before.percent,
        remainingCount: before.remainingCount,
        nextTasks: before.nextTasks,
        completed: before.completed,
        currentStageNumber: before.stageNumber,
      },
      { stages, progress, percent, remainingCount, nextTasks, completed, currentStageNumber: stageNumber },
      lastCompletedTitle,
    );
    if (!msg) return;
    const t = window.setTimeout(() => setLive(msg), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, remainingCount, completed]);

  const liveRegions = (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" id="journey-live">
        {live}
      </div>
      {alertText ? (
        <div role="alert" className="sr-only">
          {alertText}
        </div>
      ) : null}
    </>
  );

  if (loading) {
    return (
      <section aria-busy="true" aria-label="Loading your journey" className={cn("space-y-3 rounded-lg bg-card p-4 border border-line", className)}>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-2 w-full" />
        {liveRegions}
      </section>
    );
  }
  if (error) {
    return (
      <section aria-labelledby={headingId} className={cn("rounded-lg bg-card p-4 border border-line", className)}>
        <h2 id={headingId} className="sr-only">
          {title}
        </h2>
        <Alert tone="danger" live="alert" title="Couldn't load your journey">
          <p>{error}</p>
          {onRetry && (
            <Button variant="secondary" className="mt-2" onClick={onRetry}>
              Retry
            </Button>
          )}
        </Alert>
        {liveRegions}
      </section>
    );
  }

  const stageList = (
    <ol aria-label="Journey stages" className="sr-only">
      {stages.map((s, i) => (
        <li key={s.key}>
          Stage {i + 1}, {s.label}. {s.state === "done" ? "Complete" : s.state === "current" ? "Current" : "Locked"}, {s.doneCount} of {s.totalCount} tasks
          done.{s.state === "locked" && s.unlockHint ? ` ${s.unlockHint}` : ""}
        </li>
      ))}
    </ol>
  );

  if (variant === "compact") {
    return (
      <section aria-labelledby={headingId} className={cn("space-y-2", className)}>
        <h2 id={headingId} className="sr-only">
          {title}
        </h2>
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold">
            {stage?.label} <span className="font-normal text-muted">Step {stageNumber} of 5</span>
          </p>
          <p className="tabular font-semibold">{percent}%</p>
        </div>
        <ProgressBar value={percent} label="Journey progress" valueText={valueText} />
        <p className="text-sm text-muted">
          {doneTotal} of {taskTotal} done
          {overdueCount > 0 ? `, ${overdueCount} overdue` : ""}
        </p>
        {stageList}
        {liveRegions}
      </section>
    );
  }

  // The marker sits on the thick bar at the overall percentage. It strides forward with a short ease
  // (~500ms) when progress increases; motion-safe means it jumps instantly under reduced motion.
  // The marker is size-10 (10 spacing units), so it scales with --spacing: offset by the same unit, not 40px.
  const markerLeft = `calc(${percent}% - ${percent / 100} * var(--spacing) * 10)`;
  return (
    <section aria-labelledby={headingId} className={cn("rounded-md border border-line bg-card px-[22px] py-5", className)}>
      <h2 id={headingId} className="text-xl font-bold">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted">
        <span className="font-semibold text-ink">{stage?.label}</span> stage, step {stageNumber} of 5
      </p>
      <p aria-hidden className="font-display tabular mt-2 text-[2.5rem] font-extrabold leading-none tracking-[-0.02em] text-brand">
        {percent}%
      </p>
      <div className="relative mt-4 h-10">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
          <ProgressBar value={percent} label="Journey progress" valueText={valueText} size="thick" className="[&>div]:motion-safe:duration-500" />
        </div>
        <span
          aria-hidden
          style={{ left: markerLeft, transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)", ...(reduced ? { transitionDuration: "0ms" } : {}) }}
          className="pointer-events-none absolute top-0 flex size-10 items-center justify-center rounded-full border-2 border-brand bg-card shadow-marker motion-safe:transition-[left] motion-safe:duration-500"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.horse.src} alt="" width={BRAND.horse.width} height={BRAND.horse.height} className="brand-mono h-auto w-7" />
        </span>
      </div>
      <p className="tabular mt-2 text-sm text-muted">
        {doneTotal} of {taskTotal} tasks done
        {overdueCount > 0 ? `, ${overdueCount} overdue` : ""}
      </p>
      {stageList}
      {liveRegions}
    </section>
  );
}
