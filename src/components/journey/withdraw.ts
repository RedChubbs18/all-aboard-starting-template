/** D14: reasons a starter can give when withdrawing from the journey. */
export const WITHDRAW_REASONS = [
  { value: "ACCEPTED_ANOTHER_OFFER", label: "Accepted another offer" },
  { value: "ROLE_NOT_RIGHT", label: "The role isn't right for me" },
  { value: "PERSONAL_CIRCUMSTANCES", label: "Personal circumstances" },
  { value: "PAY_OR_BENEFITS", label: "Pay or benefits" },
  { value: "LOCATION_OR_HYBRID", label: "Location or hybrid working" },
  { value: "ONBOARDING_EXPERIENCE", label: "My onboarding experience" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
  { value: "OTHER", label: "Other" },
] as const;

export type WithdrawReason = (typeof WITHDRAW_REASONS)[number]["value"];
export const WITHDRAW_COMMENT_MAX = 280;
export const isWithdrawReason = (v: unknown): v is WithdrawReason => WITHDRAW_REASONS.some((r) => r.value === v);
