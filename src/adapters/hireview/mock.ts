import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import { HIREVIEW_STATUSES, type HireViewAdapter, type HireViewStatus } from "./types";

export function createHireViewMock(store: StateStore): HireViewAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "hireview", "not_started", HIREVIEW_STATUSES);
  return {
    ...m,
    key: "hireview",
    async getVettingStatus(journeyId) {
      const s = await m.getStatus(journeyId);
      return { status: s.status as HireViewStatus, updatedAt: s.updatedAt, actionUrl: "https://hireview.example.test/candidate" };
    },
  };
}
