import type { BaseAdapter } from "../types";

export interface TrainingItem {
  id: string;
  title: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
  dueDate: string | null;
}

export type TrainingStatus = TrainingItem["status"];

/** FR-1.5 anchor days, FR-3.14 / FR-4.3 mandatory training. Workday stays the system of record. */
export interface WorkdayAdapter extends BaseAdapter {
  key: "workday";
  /** `summary` (additive) is the human label, e.g. "Tuesday and Thursday". */
  getAnchorDays(journeyId: string): Promise<{ days: string[]; location: string; summary?: string }>;
  getTraining(journeyId: string): Promise<TrainingItem[]>;
  /** Additive. Simulates a course status change in Workday. */
  setTrainingStatus(journeyId: string, courseId: string, status: TrainingStatus): Promise<TrainingItem[]>;
}
