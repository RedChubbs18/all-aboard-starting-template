import type { Stage } from "@/domain/types";
import type { TaskDto } from "./types";

/** F15 / F16: what a buddy gets about each allocated starter. No starter task detail. */
export interface BuddyStarterDto {
  journeyId: string;
  name: string;
  upn: string;
  stage: Stage;
  status: "active" | "completed" | "exited";
  progressPercent: number;
  startDate: string;
}

export interface BuddyResponse {
  starters: BuddyStarterDto[];
  selectedId: string | null;
  /** Only the buddy's own tasks for the selected starter. */
  tasks: TaskDto[];
}
