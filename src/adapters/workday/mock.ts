import { statusMock } from "../mock-helpers";
import { hashString, joinDays, pick } from "../mock-seed";
import type { StateStore } from "../types";
import type { TrainingItem, TrainingStatus, WorkdayAdapter } from "./types";

/** Anchor-day patterns. The demo starter pins to Tuesday and Thursday so the script is predictable. */
const ANCHOR_PATTERNS: readonly (readonly string[])[] = [
  ["Tuesday", "Thursday"],
  ["Monday", "Wednesday"],
  ["Tuesday", "Wednesday"],
  ["Wednesday", "Thursday"],
  ["Monday", "Thursday"],
];
const PINNED: Record<string, readonly string[]> = { "journey-alex-morgan": ["Tuesday", "Thursday"] };
const LOCATIONS = ["Example Office, Floor 3", "Example Office, Floor 4", "Example Hub, Floor 2"];

export const COURSES = [
  { id: "wd-conduct", title: "Code of conduct" },
  { id: "wd-infosec", title: "Information security essentials" },
  { id: "wd-fincrime", title: "Financial crime awareness" },
  { id: "wd-dataprot", title: "Data protection and privacy" },
  { id: "wd-conduct-risk", title: "Conduct and operational risk" },
] as const;

/** Per-starter seeded progress: some starters are part-way through, the pinned demo starter starts clean. */
function seededTraining(journeyId: string): TrainingItem[] {
  const pinned = journeyId in PINNED;
  const complete = pinned ? 0 : hashString(journeyId) % 3; // 0..2 courses done
  const inProgress = pinned ? -1 : complete; // the next course is under way
  return COURSES.map((c, i) => ({
    id: c.id,
    title: c.title,
    status: i < complete ? "COMPLETE" : i === inProgress ? "IN_PROGRESS" : "NOT_STARTED",
    dueDate: null,
  }));
}

type Payload = { training?: TrainingItem[] };

export function createWorkdayMock(store: StateStore): WorkdayAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "workday", "available", ["available", "complete"]);
  const training = async (journeyId: string) => (await m.read<Payload>(journeyId)).payload.training ?? seededTraining(journeyId);
  return {
    ...m,
    key: "workday",
    async getAnchorDays(journeyId) {
      const days = [...(PINNED[journeyId] ?? pick(ANCHOR_PATTERNS, journeyId))];
      return { days, summary: joinDays(days), location: pick(LOCATIONS, `loc:${journeyId}`) };
    },
    getTraining: training,
    async setTrainingStatus(journeyId, courseId, status: TrainingStatus) {
      const items = await training(journeyId);
      if (!items.some((t) => t.id === courseId)) throw new Error(`Unknown course ${courseId}`);
      const next = items.map((t) => (t.id === courseId ? { ...t, status } : t));
      await m.write(journeyId, (await m.read(journeyId)).status, { training: next });
      return next;
    },
  };
}
