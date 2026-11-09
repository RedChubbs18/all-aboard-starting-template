import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import type { TrainingItem, WorkdayAdapter } from "./types";

const DEFAULT_TRAINING: TrainingItem[] = [
  { id: "wd-conduct", title: "Code of conduct", status: "NOT_STARTED", dueDate: null },
  { id: "wd-infosec", title: "Information security essentials", status: "NOT_STARTED", dueDate: null },
  { id: "wd-fincrime", title: "Financial crime awareness", status: "NOT_STARTED", dueDate: null },
];

export function createWorkdayMock(store: StateStore): WorkdayAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "workday", "available", ["available", "complete"]);
  return {
    ...m,
    key: "workday",
    async getAnchorDays(journeyId) {
      const s = await m.read<{ days?: string[]; location?: string }>(journeyId);
      return { days: s.payload.days ?? ["Tuesday", "Thursday"], location: s.payload.location ?? "Example Office, Floor 3" };
    },
    async getTraining(journeyId) {
      const s = await m.read<{ training?: TrainingItem[] }>(journeyId);
      return s.payload.training ?? DEFAULT_TRAINING;
    },
  };
}
