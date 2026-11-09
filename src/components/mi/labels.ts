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

export const COLLEAGUE_REASONS = [
  "ACCEPTED_ANOTHER_OFFER", "ROLE_NOT_RIGHT", "PERSONAL_CIRCUMSTANCES", "PAY_OR_BENEFITS",
  "LOCATION_OR_HYBRID", "ONBOARDING_EXPERIENCE", "PREFER_NOT_TO_SAY", "OTHER",
] as const;
export const PNP_REASONS = ["FAILED_PEV", "OFFER_WITHDRAWN_BY_LBG", "NO_SHOW"] as const;

export const REASON_LABEL: Record<string, string> = {
  ACCEPTED_ANOTHER_OFFER: "Accepted another offer",
  ROLE_NOT_RIGHT: "Role not right",
  PERSONAL_CIRCUMSTANCES: "Personal circumstances",
  PAY_OR_BENEFITS: "Pay or benefits",
  LOCATION_OR_HYBRID: "Location or hybrid working",
  ONBOARDING_EXPERIENCE: "Onboarding experience",
  PREFER_NOT_TO_SAY: "Prefer not to say",
  OTHER: "Other",
  FAILED_PEV: "Failed pre-employment vetting",
  OFFER_WITHDRAWN_BY_LBG: "Offer withdrawn by the company",
  NO_SHOW: "No show",
};

/** Readable reason text. Unknown or legacy codes (e.g. WITHDRAWN) are humanised rather than hidden. */
export const reasonLabel = (r: string | null | undefined): string =>
  !r ? "Not recorded" : (REASON_LABEL[r] ?? r.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()));

export const sourceLabel = (s: string | null | undefined): string => (s === "COLLEAGUE" ? "Colleague" : s === "PNP" ? "P&P" : "Not recorded");
