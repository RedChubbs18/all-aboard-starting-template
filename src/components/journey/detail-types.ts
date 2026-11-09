import type { BookingAdapter, InductionSession, Booking } from "@/adapters/booking/types";
import type { EquipmentChoice } from "@/adapters/equipment/types";
import type { PassOrder } from "@/adapters/pass/types";
import type { TrainingItem } from "@/adapters/workday/types";
import type { FirstAdvantageSummary, JourneyDto, PersonDto, TaskDto } from "./types";

export type { BookingAdapter, InductionSession, Booking, EquipmentChoice, PassOrder, TrainingItem };

/** Illustrative lists (synthetic). Peripherals are Day 0 items collected from the tech bar. */
export const PERIPHERAL_OPTIONS = ["External monitor", "Keyboard", "Mouse", "Headset", "Laptop stand", "Docking station"] as const;
/** FR-4.1 home working items, delivered to the colleague's home. */
export const HOME_ITEMS = ["Desk", "Chair", "Monitor", "Keyboard and mouse", "Footrest"] as const;
export const HOME_PREFIX = "Home working: ";

export interface Day0Dto {
  where: string;
  whenAt: string;
  who: string;
  notes?: string | null;
  confirmedAt: string | null;
}

export type Detail =
  | { kind: "none" }
  | { kind: "checklist"; steps: string[] }
  | { kind: "booking"; sessions: InductionSession[]; booking: Booking | null }
  | { kind: "order"; mode: "device" | "peripherals" | "home"; choice: EquipmentChoice | null }
  | { kind: "collect"; choice: EquipmentChoice | null }
  | { kind: "firstadvantage"; status: FirstAdvantageSummary }
  | { kind: "system"; provider: string; statusText: string; updatedAt: string | null }
  | { kind: "training"; items: TrainingItem[] }
  | { kind: "video"; url: string | null }
  | { kind: "photo"; day0: Day0Dto | null; day0Confirmed: boolean; confirmTaskId: string | null; order: PassOrder | null; reviewRequested: boolean }
  | { kind: "day0"; role: "confirm" | "wayfinding" | "proposal"; day0: Day0Dto | null }
  | { kind: "goals" };

export interface TaskDetailResponse {
  task: TaskDto;
  journey: Pick<JourneyDto, "id" | "status" | "currentStage" | "viewerIsStarter" | "starter" | "lm" | "buddy" | "pnp" | "viewerRelation"> & { startDate: string };
  content: { slug: string; title: string; type: string; body: string } | null;
  /** Dependencies shown for locked tasks. */
  waitingFor: { key: string; title: string }[];
  links: { label: string; href: string }[];
  detail: Detail;
}

export type { PersonDto };
