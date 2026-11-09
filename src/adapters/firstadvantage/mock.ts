import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import { HIREVIEW_STATUSES, type HireViewAdapter, type HireViewStatus } from "./types";

/** Synthetic "what's needed" copy per status. Operators can override it with the simulate `detail`. */
export const HIREVIEW_MESSAGES: Record<HireViewStatus, string> = {
  not_started: "Your vetting has not started yet. First Advantage will email you an invitation (synthetic).",
  in_progress: "First Advantage is checking your details. Nothing more is needed from you right now.",
  action_needed: "First Advantage needs one more document: upload a clear photo of your passport or driving licence.",
  cleared: "Your vetting is cleared. Thank you.",
  failed: "First Advantage could not complete your vetting. People & Places will contact you.",
};

const ACTION_URLS: Record<HireViewStatus, string> = {
  not_started: "https://firstadvantage.example.test/candidate",
  in_progress: "https://firstadvantage.example.test/candidate",
  action_needed: "https://firstadvantage.example.test/candidate/actions",
  cleared: "https://firstadvantage.example.test/candidate",
  failed: "https://firstadvantage.example.test/candidate/help",
};

const normalise = (s: string): HireViewStatus => {
  const v = s.toLowerCase();
  return (HIREVIEW_STATUSES as readonly string[]).includes(v) ? (v as HireViewStatus) : "not_started";
};

export function createHireViewMock(store: StateStore): HireViewAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "hireview", "not_started", HIREVIEW_STATUSES);
  return {
    ...m,
    key: "hireview",
    async getStatus(journeyId) {
      const s = await m.getStatus(journeyId);
      return { ...s, status: normalise(s.status) };
    },
    async getVettingStatus(journeyId) {
      const s = await m.getStatus(journeyId);
      const status = normalise(s.status);
      return { status, updatedAt: s.updatedAt, actionUrl: ACTION_URLS[status], message: s.detail ?? HIREVIEW_MESSAGES[status] };
    },
    async simulate(journeyId, status, detail) {
      if (!(HIREVIEW_STATUSES as readonly string[]).includes(status)) throw new Error(`hireview: unsupported status "${status}"`);
      // Always overwrite the detail so an old "action needed" message never lingers after a status change.
      await m.write(journeyId, status, { detail: detail ?? HIREVIEW_MESSAGES[status as HireViewStatus] });
      return m.getStatus(journeyId);
    },
  };
}
