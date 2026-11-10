/**
 * Pure view-model logic for the journey home: stage states, progress, forecast, optimistic
 * completion and screen-reader announcements. No React, so it is unit tested directly.
 * (design/journey-track.md sections 2, 4 and 6.)
 */
import { stageUnlockDate } from "@/domain/stage-timing";
import { STAGES, stageIndex, type Stage } from "@/domain/types";
import { formatDayMonth, formatLongDate, isOverdue } from "./format";
import type { StageTally, TaskDto } from "./types";

export const STAGE_META: Record<Stage, { label: string; shortLabel: string; description: string }> = {
  CONDITIONAL_OFFER: { label: "Conditional offer", shortLabel: "Offer", description: "You've accepted your offer" },
  PEV: { label: "Vetting (PEV)", shortLabel: "Vetting", description: "Complete your First Advantage pre-employment vetting" },
  UNCONDITIONAL_OFFER: { label: "Unconditional offer", shortLabel: "Confirmed", description: "Vetting complete and all offer conditions met" },
  DAY_0: { label: "Day 0", shortLabel: "Day 0", description: "Your first day" },
  DAY_30: { label: "Day 30", shortLabel: "Day 30", description: "Your first 30 days and beyond" },
};

export type StageState = "done" | "current" | "locked";

export interface TrackStage {
  key: Stage;
  label: string;
  shortLabel: string;
  description: string;
  state: StageState;
  /** Applicable tasks done / total (what people see and hear). */
  doneCount: number;
  totalCount: number;
  /** Gating tasks done / total (what drives the horse). */
  gatingDone: number;
  gatingTotal: number;
  unlockHint?: string;
}

export interface ForecastTask {
  id: string;
  title: string;
  dueDate: string;
  overdue: boolean;
  href: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED";
  owner: TaskDto["owner"];
}

export interface JourneyView {
  stages: TrackStage[];
  /** 0..1. */
  progress: number;
  /** Rounded, capped at 99 until the journey is completed. */
  percent: number;
  doneTotal: number;
  taskTotal: number;
  remainingCount: number;
  nextTasks: ForecastTask[];
  projectedFinish: string | null;
  overdueCount: number;
  completed: boolean;
  currentStageNumber: number;
}

export interface ViewInput {
  tasks: TaskDto[];
  /** Server tally over every owner's tasks (starter view hides non-starter tasks but progress still counts them). */
  overall?: Record<Stage, StageTally>;
  viewerIsStarter?: boolean;
  currentStage: Stage;
  status: "active" | "completed" | "exited";
  /** ISO start date. D31: Day 0 and Day 30 explain that they wait for their date. */
  startDate?: string;
}

/** Tasks the starter should see: `applicable=false` tasks never appear (FR-4.5). */
export const visibleTasks = (tasks: TaskDto[]) => tasks.filter((t) => t.applicable !== false);

/** Tally applicable, non-optional tasks per stage. */
export function tallyStages(tasks: Pick<TaskDto, "stage" | "status" | "gating" | "optional" | "applicable">[]): Record<Stage, StageTally> {
  return Object.fromEntries(
    STAGES.map((s) => {
      const st = tasks.filter((t) => t.stage === s && t.applicable !== false && !t.optional);
      const g = st.filter((t) => t.gating);
      return [s, { done: st.filter((t) => t.status === "DONE").length, total: st.length, gatingDone: g.filter((t) => t.status === "DONE").length, gatingTotal: g.length }];
    }),
  ) as Record<Stage, StageTally>;
}

/** Overall percent for a journey from a tally (used server-side for the buddy summary card). */
export function overallPercent(tally: Record<Stage, StageTally>, currentStage: Stage, status: "active" | "completed" | "exited"): number {
  const completed = status === "completed";
  const at = stageIndex(currentStage);
  const stages = STAGES.map((k, i) => ({
    state: (completed || i < at ? "done" : i === at ? "current" : "locked") as StageState,
    doneCount: tally[k].done,
    totalCount: tally[k].total,
    gatingDone: tally[k].gatingDone,
    gatingTotal: tally[k].gatingTotal,
  }));
  return displayPercent(computeProgress(stages, completed), completed);
}

const ratio = (done: number, total: number, state: StageState): number => {
  if (total === 0) return state === "done" ? 1 : 0;
  return done / total;
};

/** Stage fraction = gating done / gating total (all tasks when none are gating), per the track spec. */
export function computeProgress(stages: Pick<TrackStage, "state" | "gatingDone" | "gatingTotal" | "doneCount" | "totalCount">[], completed: boolean): number {
  if (completed) return 1;
  if (stages.length === 0) return 0;
  const sum = stages.reduce((acc, s) => {
    const useGating = s.gatingTotal > 0;
    const f = useGating ? ratio(s.gatingDone, s.gatingTotal, s.state) : ratio(s.doneCount, s.totalCount, s.state);
    return acc + f;
  }, 0);
  return Math.max(0, Math.min(1, sum / stages.length));
}

export const displayPercent = (progress: number, completed: boolean) => {
  const p = Math.round(progress * 100);
  return completed ? p : Math.min(99, p);
};

/** D31: "Unlocks on <date>." once the earlier tasks are done, otherwise the tasks plus the earliest date. */
function unlockHint(input: ViewInput, key: Stage, i: number, at: number, prev: string, now: Date): string {
  const tasksHint = `Unlocks when ${prev} tasks are done.`;
  const unlock = input.startDate ? stageUnlockDate(new Date(input.startDate), key) : null;
  if (!unlock || unlock.getTime() <= now.getTime()) return tasksHint;
  const on = formatLongDate(unlock.toISOString());
  const cur = input.overall?.[STAGES[at]];
  const currentDone = cur ? cur.gatingTotal > 0 && cur.gatingDone === cur.gatingTotal : false;
  return i === at + 1 && currentDone ? `Unlocks on ${on}.` : `Unlocks when ${prev} tasks are done, and not before ${on}.`;
}

export function deriveView(input: ViewInput, now: Date = new Date()): JourneyView {
  const all = visibleTasks(input.tasks);
  // Optional tasks never count; a starter's forecast only counts the starter's own tasks (D20).
  const tasks = all.filter((t) => !t.optional && (!input.viewerIsStarter || t.owner === "STARTER"));
  const completed = input.status === "completed";
  const at = stageIndex(input.currentStage);

  const stages: TrackStage[] = STAGES.map((key, i) => {
    const st = tasks.filter((t) => t.stage === key);
    const gating = st.filter((t) => t.gating);
    const ov = input.overall?.[key];
    const state: StageState = completed || i < at ? "done" : i === at ? "current" : "locked";
    const prev = i > 0 ? STAGE_META[STAGES[i - 1]].label : null;
    return {
      key,
      ...STAGE_META[key],
      state,
      doneCount: st.filter((t) => t.status === "DONE").length,
      totalCount: st.length,
      gatingDone: ov ? ov.gatingDone : gating.filter((t) => t.status === "DONE").length,
      gatingTotal: ov ? ov.gatingTotal : gating.length,
      unlockHint: state === "locked" && prev ? unlockHint(input, key, i, at, prev, now) : undefined,
    };
  });

  const progress = computeProgress(
    input.overall ? stages.map((s) => ({ ...s, doneCount: input.overall![s.key].done, totalCount: input.overall![s.key].total })) : stages,
    completed,
  );
  const open = tasks.filter((t) => t.status !== "DONE");

  const rank = (t: TaskDto) => (t.status === "BLOCKED" ? 2 : isOverdue(t.dueDate, now) ? 0 : 1);
  const upcoming = open
    .filter((t) => t.status !== "LOCKED")
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime() ||
        stageIndex(a.stage) - stageIndex(b.stage),
    );

  const finish = open.length ? new Date(Math.max(...open.map((t) => new Date(t.dueDate).getTime()))).toISOString() : null;

  return {
    stages,
    progress,
    percent: displayPercent(progress, completed),
    doneTotal: tasks.length - open.length,
    taskTotal: tasks.length,
    remainingCount: open.length,
    nextTasks: upcoming.slice(0, 3).map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      overdue: isOverdue(t.dueDate, now),
      href: `/journey/task/${t.id}`,
      status: t.status as ForecastTask["status"],
      owner: t.owner,
    })),
    projectedFinish: finish,
    overdueCount: open.filter((t) => isOverdue(t.dueDate, now) && t.status !== "LOCKED").length,
    completed,
    currentStageNumber: at + 1,
  };
}

/**
 * Optimistic completion: mark the task DONE and unlock tasks whose dependencies are now all done
 * (same-or-earlier stage only). The server result replaces this on revalidate, so it only has to be
 * good enough to move the horse, counts and next-due immediately.
 */
export function applyOptimisticDone(tasks: TaskDto[], taskId: string, currentStage: Stage, now: Date = new Date()): TaskDto[] {
  const target = tasks.find((t) => t.id === taskId);
  if (!target || target.status === "DONE") return tasks;
  const done = new Set(tasks.filter((t) => t.status === "DONE").map((t) => t.key));
  done.add(target.key);
  const at = stageIndex(currentStage);
  return tasks.map((t) => {
    if (t.id === taskId) return { ...t, status: "DONE", completedAt: now.toISOString(), blockedReason: null, lockedReason: null };
    if (t.status === "LOCKED" && stageIndex(t.stage) <= at && t.dependsOn.every((k) => done.has(k) || !tasks.some((x) => x.key === k))) {
      return { ...t, status: "TODO", lockedReason: null };
    }
    return t;
  });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Screen-reader sentence(s) for a change in progress (design/journey-track.md section 6). */
export type ChangeView = Pick<JourneyView, "stages" | "progress" | "percent" | "remainingCount" | "nextTasks" | "completed" | "currentStageNumber">;

export function describeChange(prev: ChangeView, next: ChangeView, doneTitle?: string): string | null {
  if (next.progress === prev.progress && next.remainingCount === prev.remainingCount) return null;
  const parts: string[] = [];
  if (next.completed && !prev.completed) {
    return "All onboarding tasks complete. Journey 100 percent complete.";
  }
  if (next.progress < prev.progress) {
    return `Journey now ${next.percent} percent complete. ${plural(next.remainingCount, "task", "tasks")} to go.`;
  }
  if (doneTitle) parts.push(`${doneTitle} marked done.`);
  parts.push(`Journey ${next.percent} percent complete.`);
  parts.push(`${plural(next.remainingCount, "task", "tasks")} to go.`);
  const up = next.nextTasks[0];
  if (up) parts.push(`Next: ${up.title}, due ${formatLongDate(up.dueDate)}.`);
  const crossed = next.currentStageNumber > prev.currentStageNumber;
  if (crossed) {
    const done = prev.stages[prev.currentStageNumber - 1];
    const now = next.stages[next.currentStageNumber - 1];
    parts.push(`Stage ${prev.currentStageNumber}, ${done.label}, complete. You are now on stage ${next.currentStageNumber} of 5, ${now.label}.`);
  }
  return parts.join(" ");
}

/** aria-valuetext for the progress bar. */
export function progressValueText(v: JourneyView): string {
  const stage = v.stages[Math.max(0, v.currentStageNumber - 1)];
  return `${v.percent} percent complete. Stage ${v.currentStageNumber} of 5: ${stage.label}. ${v.doneTotal} of ${v.taskTotal} tasks done.`;
}

export function forecastSentence(v: JourneyView): string {
  if (v.remainingCount === 0) return "All done.";
  const finish = v.projectedFinish ? ` Projected finish ${formatDayMonth(v.projectedFinish)}.` : "";
  return `${plural(v.remainingCount, "task", "tasks")} to go.${finish}`;
}

/**
 * F6: the next task to open after finishing `current`. Only the starter's own, actionable, non-optional
 * tasks; the same stage first, then by stage order, then due date.
 */
export function nextActionableTask(tasks: TaskDto[], current: Pick<TaskDto, "id" | "stage"> & { owner?: TaskDto["owner"] }): TaskDto | null {
  const rank = (t: TaskDto) => (t.stage === current.stage ? -1 : stageIndex(t.stage));
  const candidates = visibleTasks(tasks)
    .filter((t) => t.id !== current.id && t.owner === (current.owner ?? "STARTER") && !t.optional && t.canAct && (t.status === "TODO" || t.status === "IN_PROGRESS"))
    .sort((a, b) => rank(a) - rank(b) || new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  return candidates[0] ?? null;
}
