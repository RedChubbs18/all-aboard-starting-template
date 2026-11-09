import type { BaseAdapter } from "../types";

export const HIREVIEW_STATUSES = ["not_started", "in_progress", "action_needed", "cleared", "failed"] as const;
export type HireViewStatus = (typeof HIREVIEW_STATUSES)[number];

/** FR-2.3. HireView remains the system of record for vetting; we only read a status. */
export interface HireViewAdapter extends BaseAdapter {
  key: "hireview";
  getVettingStatus(journeyId: string): Promise<{ status: HireViewStatus; updatedAt: string; actionUrl: string }>;
}
