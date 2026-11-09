import type { BaseAdapter } from "../types";

export interface TrainingItem {
  id: string;
  title: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
  dueDate: string | null;
}

/** FR-1.5 anchor days, FR-3.14 / FR-4.3 mandatory training. Workday stays the system of record. */
export interface WorkdayAdapter extends BaseAdapter {
  key: "workday";
  getAnchorDays(journeyId: string): Promise<{ days: string[]; location: string }>;
  getTraining(journeyId: string): Promise<TrainingItem[]>;
}
