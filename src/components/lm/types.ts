/** Wire types for the LM API (src/app/api/lm). Dates are ISO strings. */
import type { GoalHorizon, Owner, Stage, TaskStatus, TaskType } from "@/domain/types";

export type FirstAdvantageState = "NOT_STARTED" | "IN_PROGRESS" | "ACTION_NEEDED" | "COMPLETE" | "FAILED";

export interface StarterSummary {
  id: string;
  starterName: string;
  startDate: string;
  stage: Stage;
  status: string;
  percent: number;
  overdue: number;
  overdueLm: number;
  blocked: number;
  firstadvantage: FirstAdvantageState | null;
  /** First Advantage action_needed / failed: shown as a red flag. */
  redFlag: boolean;
  needsAttention: boolean;
  nextDue: { title: string; dueDate: string } | null;
}

export interface StarterListResponse {
  starters: StarterSummary[];
  /** Completed and exited journeys: read-only records, never deleted (F15). */
  past: StarterSummary[];
}

export interface Person {
  id: string;
  displayName: string;
  upn: string;
  jobTitle: string | null;
  chatUrl: string;
}

export interface TaskDto {
  id: string;
  key: string;
  title: string;
  description: string;
  stage: Stage;
  owner: Owner;
  type: TaskType;
  status: TaskStatus;
  source: "CORE" | "TEAM" | "BESPOKE";
  dueDate: string;
  completedAt: string | null;
  blockedReason: string | null;
  evidence: string | null;
  overdue: boolean;
  waitingFor: string[];
  /** LM may mark this task done / reopen it. */
  canAct: boolean;
}

export interface CheckInDto {
  id: string;
  cadence: string;
  scheduledAt: string;
  meetingLink: string | null;
}

export interface GoalDto {
  id: string;
  horizon: GoalHorizon;
  text: string;
  done: boolean;
}

export interface Day0Dto {
  where: string;
  whenAt: string;
  who: string;
  confirmedAt: string | null;
}

export interface StarterDetail {
  journey: {
    id: string;
    stage: Stage;
    status: string;
    startDate: string;
    flagged: boolean;
    flagReason: string | null;
    firstadvantage: FirstAdvantageState | null;
    redFlag: boolean;
  };
  starter: Person;
  lm: Person;
  buddy: Person | null;
  /** Buddy-eligible members of the starter's team, never the LM or the starter. */
  buddyCandidates: { id: string; displayName: string; upn: string; jobTitle: string | null }[];
  progress: {
    percent: number;
    total: number;
    done: number;
    overdue: number;
    blocked: number;
    perStage: Record<Stage, { total: number; done: number }>;
  };
  tasks: TaskDto[];
  /** Present while the `photo-check-override` task is applicable and not done (D12). Issues only, never the image. */
  photoReview: { taskKey: string; issues: string[] } | null;
  checkIns: CheckInDto[];
  goals: GoalDto[];
  day0: Day0Dto | null;
  /** D39: guest-to-member conversion status. */
  workAccount: WorkAccountDto;
}

/** D39: mirrors WorkAccountStatus in src/server/identity-conversion.ts (no secrets, no personal email). */
export interface WorkAccountDto {
  state: "none" | "pending" | "simulated" | "converted" | "failed";
  upn: string | null;
  at: string | null;
  emailSent: boolean | null;
  error: string | null;
}

export interface ApiErrorBody {
  error: string;
  message?: string;
  fields?: Record<string, string>;
}
