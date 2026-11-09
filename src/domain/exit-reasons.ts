/**
 * D14 exit reasons: the single source of truth (engine validation, P&P record-exit, MI report, starter withdraw).
 * Pure and client-safe (no server imports).
 */
export const COLLEAGUE_REASONS = [
  "ACCEPTED_ANOTHER_OFFER",
  "ROLE_NOT_RIGHT",
  "PERSONAL_CIRCUMSTANCES",
  "PAY_OR_BENEFITS",
  "LOCATION_OR_HYBRID",
  "ONBOARDING_EXPERIENCE",
  "PREFER_NOT_TO_SAY",
  "OTHER",
] as const;

/** Reasons only P&P records. */
export const PNP_REASONS = ["FAILED_PEV", "OFFER_WITHDRAWN_BY_LBG", "NO_SHOW"] as const;

export const EXIT_REASONS = [...PNP_REASONS, ...COLLEAGUE_REASONS] as const;

export type ColleagueReason = (typeof COLLEAGUE_REASONS)[number];
export type PnpReason = (typeof PNP_REASONS)[number];
export type ExitReason = (typeof EXIT_REASONS)[number];
export type ReasonSource = "COLLEAGUE" | "PNP";

export const REASON_LABEL: Record<ExitReason, string> = {
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

export const isExitReason = (r: string): r is ExitReason => (EXIT_REASONS as readonly string[]).includes(r);

/** Readable reason text. Unknown or legacy codes (e.g. WITHDRAWN) are humanised rather than hidden. */
export const reasonLabel = (r: string | null | undefined): string =>
  !r ? "Not recorded" : (isExitReason(r) ? REASON_LABEL[r] : r.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()));
