"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { STAGES, type Stage } from "@/domain/types";
import { displayPercent, describeChange, type ForecastTask, type TrackStage } from "./derive";
import { HORSE_ANCHOR, HorseArt, type HorseVariant } from "./HorseArt";
import { milestonePoint, milestonesReached, pointAt, trackPathD, VIEW_H, VIEW_W } from "./track-geometry";

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
  /** Tap on a milestone dot (pointer users). Keyboard users use the stage buttons. */
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

const HORSE_SCALE = 40 / 120;
const STAR_VECTORS = [
  [-26, -22],
  [0, -30],
  [26, -22],
  [-30, 0],
  [30, 0],
  [0, 12],
] as const;

const currentNumber = (stages: TrackStage[], completed: boolean) => {
  if (completed) return stages.length;
  const i = stages.findIndex((s) => s.state === "current");
  return i === -1 ? stages.length : i + 1;
};

function horseTransform(progress: number): string {
  const { x, y, angle } = pointAt(progress);
  return `translate(${x.toFixed(2)} ${(y - 2).toFixed(2)}) rotate(${angle.toFixed(2)}) scale(${HORSE_SCALE}) translate(${-HORSE_ANCHOR.x} ${-HORSE_ANCHOR.y})`;
}

export function useReducedMotion(override?: boolean): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
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
    onSelectStage,
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

  // --- animation: the horse and the percent number are driven imperatively (transform/text only).
  const horseRef = useRef<SVGGElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(progress);
  const [initial] = useState(progress);
  const [celebrating, setCelebrating] = useState(false);
  const [popStage, setPopStage] = useState<number | null>(null);
  const prev = useRef({ progress, percent, remainingCount, nextTasks, stages, completed, stageNumber });

  useLayoutEffect(() => {
    const from = shown.current;
    const to = progress;
    const paint = (p: number) => {
      horseRef.current?.setAttribute("transform", horseTransform(p));
      if (pctRef.current) pctRef.current.textContent = String(displayPercent(p, completed && p >= 1));
    };
    if (from === to) {
      paint(to);
      return;
    }
    if (reduced || to < from) {
      shown.current = to;
      paint(to);
      return;
    }
    const duration = Math.max(500, Math.min(1200, 1200 * (to - from) * 5));
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const p = from + (to - from) * eased;
      shown.current = p;
      paint(p);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      shown.current = to;
    };
  }, [progress, reduced, completed]);

  // --- celebration on milestone crossing / completion
  useEffect(() => {
    const before = prev.current;
    const crossed = milestonesReached(progress) > milestonesReached(before.progress) || (completed && !before.completed);
    if (!crossed) return;
    const idx = Math.min(4, milestonesReached(progress) - 1);
    setCelebrating(true);
    setPopStage(idx);
    const t = window.setTimeout(() => {
      setCelebrating(false);
      setPopStage(null);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [progress, completed]);

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
      <section aria-busy="true" aria-label="Loading your journey" className={cn("space-y-3 rounded-lg bg-surface p-4 shadow-card", className)}>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-2 w-full" />
        {liveRegions}
      </section>
    );
  }
  if (error) {
    return (
      <section aria-labelledby={headingId} className={cn("rounded-lg bg-surface p-4 shadow-card", className)}>
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
            {stage?.label} <span className="font-normal text-text-muted">Step {stageNumber} of 5</span>
          </p>
          <p className="tabular font-semibold">{percent}%</p>
        </div>
        <ProgressBar value={percent} label="Journey progress" valueText={valueText} />
        <p className="text-sm text-text-muted">
          {doneTotal} of {taskTotal} done
          {overdueCount > 0 ? `, ${overdueCount} overdue` : ""}
        </p>
        {stageList}
        {liveRegions}
      </section>
    );
  }

  const horseVariant: HorseVariant = completed || celebrating ? "celebrate" : progress <= 0 ? "rest" : "gallop";
  const horsePos = pointAt(progress);

  return (
    <section aria-labelledby={headingId} className={cn("rounded-lg bg-surface p-4 shadow-card", className)}>
      <h2 id={headingId} className="text-lg font-semibold">
        {title}
      </h2>

      <div className="mt-1 flex items-baseline justify-between gap-2">
        <p className="text-text-muted">
          <span className="font-semibold text-text">{stage?.label}</span> stage, step {stageNumber} of 5
        </p>
        <p aria-hidden className="tabular text-base font-semibold">
          <span ref={pctRef}>{displayPercent(initial, completed)}</span>%
        </p>
      </div>

      <div className="relative mt-2">
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block h-auto w-full text-brand lg:max-h-[180px]"
        >
          <path d={trackPathD()} fill="none" stroke="var(--color-border)" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
          <path d={trackPathD()} fill="none" stroke="var(--color-surface)" strokeWidth={2} strokeDasharray="2 9" strokeLinecap="round" />
          <rect x={pointAt(0).x - 2} y={pointAt(0).y - 14} width={4} height={28} rx={2} fill="var(--color-brand-strong)" />

          {STAGES.map((key, i) => {
            const m = milestonePoint(i + 1);
            const s = stages[i];
            const isFinish = i === 4;
            const done = s?.state === "done";
            const current = s?.state === "current";
            return (
              <g key={key} className={popStage === i ? "milestone-pop" : undefined}>
                {current && !reduced && <circle cx={m.x} cy={m.y} r={11} fill="var(--color-brand)" opacity={0.35} className="halo-pulse" />}
                <circle
                  cx={m.x}
                  cy={m.y}
                  r={11}
                  strokeWidth={3}
                  fill={done ? "var(--color-brand)" : current ? "var(--color-surface)" : isFinish ? "var(--color-accent)" : "var(--color-surface-alt)"}
                  stroke={done ? "var(--color-surface)" : current ? "var(--color-brand)" : isFinish ? "var(--color-brand-strong)" : "var(--color-border)"}
                />
                {done ? (
                  <path d={`M${m.x - 5} ${m.y} l3.5 3.5 l6.5 -7`} fill="none" stroke="var(--color-surface)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                ) : isFinish ? (
                  <path d={`M${m.x - 3} ${m.y + 6} V${m.y - 6} h8 l-2 3 l2 3 h-8`} fill="var(--color-brand-strong)" stroke="var(--color-brand-strong)" strokeWidth={1.5} strokeLinejoin="round" />
                ) : !current ? (
                  <g fill="none" stroke="var(--color-text-muted)" strokeWidth={1.8}>
                    <rect x={m.x - 4} y={m.y - 1} width={8} height={6} rx={1} fill="var(--color-text-muted)" />
                    <path d={`M${m.x - 2.5} ${m.y - 1} v-2 a2.5 2.5 0 0 1 5 0 v2`} />
                  </g>
                ) : null}
                {/* 44x44 invisible tap target; keyboard users use the stage buttons below. */}
                {onSelectStage && (
                  <circle
                    cx={m.x}
                    cy={m.y}
                    r={22}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onClick={() => onSelectStage(key)}
                  />
                )}
              </g>
            );
          })}

          <g ref={horseRef} className="text-brand-strong" transform={horseTransform(initial)}>
            <HorseArt variant={horseVariant} />
          </g>

          {celebrating && (
            <g>
              {STAR_VECTORS.map(([dx, dy], i) => (
                <path
                  key={i}
                  className="star-burst"
                  style={{ ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px`, transformBox: "fill-box", transformOrigin: "center" }}
                  transform={`translate(${horsePos.x} ${horsePos.y - 22})`}
                  d="M0 -5l1.5 3.5 3.5 1.5-3.5 1.5L0 5l-1.5-3.5L-5 0l3.5-1.5z"
                  fill="var(--color-accent)"
                />
              ))}
            </g>
          )}
        </svg>

        <div aria-hidden className="pointer-events-none relative h-5">
          {stages.map((s, i) => (
            <span
              key={s.key}
              className={cn(
                "absolute top-0 -translate-x-1/2 whitespace-nowrap text-xs",
                s.state === "current" ? "font-bold text-text" : "text-text-muted",
              )}
              style={{ left: `${(milestonePoint(i + 1).x / VIEW_W) * 100}%` }}
            >
              {s.shortLabel}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <ProgressBar value={percent} label="Journey progress" valueText={valueText} className="flex-1" />
        <p className="tabular shrink-0 text-sm text-text-muted">
          {doneTotal} of {taskTotal}
        </p>
      </div>

      {stageList}
      {liveRegions}
    </section>
  );
}
