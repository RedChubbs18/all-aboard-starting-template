// D31 stage timing. Pure and dependency-free so client code (journey view) can share it with the engine.
import type { Stage } from "./types";

const DAY_MS = 86_400_000;

/** D31: Day 30 opens this many days after the start date. */
export const DAY_30_OFFSET_DAYS = 30;

/**
 * D31: the earliest moment a stage may begin, whatever the tasks say. Day 0 never opens before the journey's
 * start date and Day 30 not before start + 30 days. Earlier stages have no timing rule (null).
 */
export function stageUnlockDate(startDate: Date, stage: Stage): Date | null {
  if (stage === "DAY_0") return startDate;
  if (stage === "DAY_30") return new Date(startDate.getTime() + DAY_30_OFFSET_DAYS * DAY_MS);
  return null;
}

/** True when the stage's timing rule (if any) allows it to start at `now`. D21 goals use the Day 0 rule too. */
export function isStageTimeReached(startDate: Date, stage: Stage, now: Date): boolean {
  const at = stageUnlockDate(startDate, stage);
  return !at || now.getTime() >= at.getTime();
}
