import { STAGES, type Stage } from "@/domain/types";

/** Display labels. Pure and client-safe (no server imports). */
export const STAGE_LABEL: Record<Stage, string> = {
  CONDITIONAL_OFFER: "Conditional offer",
  PEV: "Pre-employment vetting",
  UNCONDITIONAL_OFFER: "Unconditional offer",
  DAY_0: "Day 0",
  DAY_30: "Day 30",
};

export const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  exited: "Exited",
  flagged: "Flagged",
};

export const OWNER_LABEL: Record<string, string> = {
  STARTER: "Starter",
  LM: "Line manager",
  BUDDY: "Buddy",
  PNP: "P&P",
  SYSTEM: "System",
};

export const ISSUE_KIND_LABEL: Record<string, string> = {
  FAILED: "Failed",
  ACTION_NEEDED: "Action needed",
  BLOCKED: "Blocked",
  OVERDUE: "Overdue",
};

export const stageLabel = (s: string | null | undefined): string => (s && s in STAGE_LABEL ? STAGE_LABEL[s as Stage] : (s ?? "Unknown"));

export { STAGES };

// D14: the category list, labels and helpers live in one module (shared with the engine, P&P record-exit and starter withdraw).
export { COLLEAGUE_REASONS, PNP_REASONS, REASON_LABEL, reasonLabel } from "@/domain/exit-reasons";

export const sourceLabel = (s: string | null | undefined): string => (s === "COLLEAGUE" ? "Colleague" : s === "PNP" ? "P&P" : "Not recorded");
