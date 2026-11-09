// Pure domain types. No framework or DB imports in src/domain.

export const STAGES = [
  "CONDITIONAL_OFFER",
  "PEV",
  "UNCONDITIONAL_OFFER",
  "DAY_0",
  "DAY_30",
] as const;
export type Stage = (typeof STAGES)[number];

export const OWNERS = ["STARTER", "LM", "BUDDY", "PNP", "SYSTEM"] as const;
export type Owner = (typeof OWNERS)[number];

export const TASK_TYPES = [
  "INFO",
  "ACTION",
  "BOOKING",
  "ORDER",
  "INTEGRATION_STATUS",
  "TRAINING",
  "VIDEO",
  "CHECKLIST",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const SOURCES = ["CORE", "TEAM", "BESPOKE"] as const;
export type Source = (typeof SOURCES)[number];

export const TASK_STATUSES = ["LOCKED", "TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const JOURNEY_STATUSES = ["active", "completed", "exited"] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

export const ROLES = ["STARTER", "BUDDY", "LM", "PNP", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const GOAL_HORIZONS = ["30", "60", "90", "CASCADED"] as const;
export type GoalHorizon = (typeof GOAL_HORIZONS)[number];

export const CONTENT_TYPES = [
  "POLICY",
  "BENEFIT",
  "DEVICE_INFO",
  "WORKSPACE_INFO",
  "CONTRACT_RECAP",
  "GUIDE",
  "FLOOR_PLAN",
  "VIDEO",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const ADAPTER_KEYS = [
  "identity",
  "sailpoint",
  "hireview",
  "workday",
  "itrequest",
  "equipment",
  "pass",
  "booking",
  "photocheck",
  "chatbot",
  "notification",
] as const;
export type AdapterKey = (typeof ADAPTER_KEYS)[number];

export const stageIndex = (s: Stage): number => STAGES.indexOf(s);

/** A template as authored (DB TaskTemplate / seed templates.json). */
export interface TemplateInput {
  key: string;
  title: string;
  description?: string;
  stage: Stage;
  owner: Owner;
  type: TaskType;
  dueOffsetDays: number;
  dependsOn: string[];
  source: Source;
  teamId?: string | null;
  adapterKey?: string | null;
  gating: boolean;
  contentSlug?: string | null;
  /** `done:KEY` or `notDone:KEY`. Task is only applicable when the condition holds. */
  condition?: string | null;
  sortOrder?: number;
  /** DB id of the template, when persisted. */
  id?: string;
}

export interface TaskState {
  id: string;
  templateId?: string | null;
  key: string;
  title: string;
  description: string;
  stage: Stage;
  owner: Owner;
  type: TaskType;
  status: TaskStatus;
  dueDate: Date;
  completedAt: Date | null;
  blockedReason: string | null;
  evidence: string | null;
  dependsOn: string[];
  source: Source;
  adapterKey: string | null;
  gating: boolean;
  contentSlug: string | null;
  condition: string | null;
  /** False when `condition` is not met: excluded from gating, progress and lists. */
  applicable: boolean;
  sortOrder: number;
}

export interface JourneyState {
  id: string;
  starterId: string;
  lmId: string;
  buddyId: string | null;
  teamId: string;
  startDate: Date;
  currentStage: Stage;
  status: JourneyStatus;
  exitReason: string | null;
  exitStage: Stage | null;
  completedAt: Date | null;
  flagged: boolean;
  flagReason: string | null;
  tasks: TaskState[];
}

/** Audit record to persist (maps 1:1 to the Event table). */
export interface NewEvent {
  journeyId: string | null;
  actorId: string | null;
  type: EventType;
  entity: "Journey" | "Task" | "Integration" | string;
  entityId: string | null;
  from: string | null;
  to: string | null;
  data: Record<string, unknown> | null;
  createdAt: Date;
}

export type EventType =
  | "JOURNEY_CREATED"
  | "STAGE_CHANGED"
  | "TASK_STATUS_CHANGED"
  | "TASK_ADDED"
  | "TASK_APPLICABILITY_CHANGED"
  | "JOURNEY_FLAGGED"
  | "JOURNEY_UNFLAGGED"
  | "JOURNEY_COMPLETED"
  | "JOURNEY_EXITED"
  | "INTEGRATION_STATUS"
  | "INTEGRATION_FAILED"
  | "BUDDY_ALLOCATED"
  | "DAY0_PROPOSED"
  | "DAY0_CONFIRMED"
  | "CHECKIN_SET"
  | "GOAL_ADDED"
  | "GOAL_UPDATED"
  | "NUDGE_SENT"
  | "SUPPORT_RAISED"
  | "PHOTO_OVERRIDE"
  | (string & {});

export interface EngineResult {
  journey: JourneyState;
  events: NewEvent[];
}

export interface Ctx {
  now?: Date;
  actorId?: string | null;
}
