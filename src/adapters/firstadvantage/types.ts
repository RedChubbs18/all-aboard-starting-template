import type { BaseAdapter } from "../types";

export const FIRSTADVANTAGE_STATUSES = ["not_started", "in_progress", "action_needed", "cleared", "failed"] as const;
export type FirstAdvantageStatus = (typeof FIRSTADVANTAGE_STATUSES)[number];

/** FR-2.3. First Advantage remains the system of record for vetting; we only read a status. */
export interface FirstAdvantageAdapter extends BaseAdapter {
  key: "firstadvantage";
  /**
   * `message` (additive) is a synthetic plain-language "what's needed" line. `actionUrl` is the link out to First Advantage.
   */
  getVettingStatus(journeyId: string): Promise<{ status: FirstAdvantageStatus; updatedAt: string; actionUrl: string; message?: string }>;
}
