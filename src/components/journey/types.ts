/**
 * JSON shapes shared by the /api/starter routes and the journey components.
 * Dates are ISO strings. Nothing here is a Prisma type, so the same props work for the
 * starter view, the buddy view (read-only) and the LM detail view (WS2) via `readOnly` / `highlightOwner`.
 */
import type { Owner, Stage, TaskStatus, TaskType } from "@/domain/types";

export interface PersonDto {
  id: string;
  name: string;
  upn: string;
  photoUrl: string | null;
  jobTitle: string | null;
  teamRole: string | null;
  bio: string | null;
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
  dueDate: string;
  completedAt: string | null;
  blockedReason: string | null;
  dependsOn: string[];
  gating: boolean;
  /** F12: shown as "Optional", never gating, not counted in progress. */
  optional?: boolean;
  /** F4: opening the task page completes it. */
  autoCompleteOnOpen?: boolean;
  contentSlug: string | null;
  adapterKey: string | null;
  source: "CORE" | "TEAM" | "BESPOKE";
  /** Server-computed with canActOnTask for the signed-in viewer. */
  canAct: boolean;
  /** Omitted or true = show. False (template condition not met, FR-4.5) = hide everywhere. */
  applicable?: boolean;
  /** Why a LOCKED task is locked, in plain words ("Waiting for: ..." / "Unlocks when ..."). */
  lockedReason: string | null;
}

export type ViewerRelation = "STARTER" | "BUDDY" | "LM" | "PNP" | "ADMIN" | "OTHER";

export interface FirstAdvantageSummary {
  status: "not_started" | "in_progress" | "action_needed" | "cleared" | "failed";
  updatedAt: string;
  actionUrl: string;
}

export interface JourneyDto {
  id: string;
  status: "active" | "completed" | "exited";
  currentStage: Stage;
  startDate: string;
  flagged: boolean;
  flagReason: string | null;
  starter: PersonDto;
  lm: PersonDto;
  buddy: PersonDto | null;
  /** P&P contact shown on the vetting stage (FR-2.2). */
  pnp: PersonDto | null;
  viewerRelation: ViewerRelation;
  /** True when the viewer is the starter of this journey. */
  viewerIsStarter: boolean;
  tasks: TaskDto[];
  firstadvantage: FirstAdvantageSummary | null;
  /** F2: progress over ALL applicable tasks (every owner), so hidden manager delays still show. */
  overall?: Record<Stage, StageTally>;
  /** F7: First Advantage failed. Starters see a full-page warning and all starter actions return 409. */
  vettingFailed?: boolean;
  /** F7: P&P phone placeholder. */
  pnpPhone?: string;
}

export interface StageTally {
  done: number;
  total: number;
  gatingDone: number;
  gatingTotal: number;
}

export interface JourneyResponse {
  journey: JourneyDto;
  /** Other journeys the viewer may open (LM, P&P, admin, buddy with several starters). */
  others: { id: string; starterName: string; stage: Stage }[];
}
