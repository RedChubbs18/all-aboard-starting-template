import { COLLEAGUE_REASONS, REASON_LABEL, type ColleagueReason } from "@/domain/exit-reasons";

/** D14: reasons a starter can give when withdrawing from the journey. */
export const WITHDRAW_REASONS = COLLEAGUE_REASONS.map((value) => ({ value, label: REASON_LABEL[value] }));

export type WithdrawReason = ColleagueReason;
export const WITHDRAW_COMMENT_MAX = 280;
export const isWithdrawReason = (v: unknown): v is WithdrawReason => WITHDRAW_REASONS.some((r) => r.value === v);
