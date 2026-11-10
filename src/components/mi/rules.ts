/** Thresholds and wording for the MI flags (D36). Pure and client-safe: the page shows these exact rules, the server applies them. */

/** Major flags for line manager accountability. */
export const MAJOR_FLAG = {
  /** Rule 1: an LM action more than this many days overdue. */
  taskOverdueDays: 5,
  /** Rule 2: more than this many overdue LM actions held by one LM. */
  manyOverdue: 3,
  /** Rule 3: Day 0 arrangements overdue when the start date is this close (or already passed). */
  day0WindowDays: 5,
} as const;

export type MajorFlagRule = "TASK_OVERDUE" | "MANY_OVERDUE" | "DAY0_NEAR_START";

export const MAJOR_FLAG_RULES: { rule: MajorFlagRule; label: string; text: string }[] = [
  { rule: "TASK_OVERDUE", label: `Over ${MAJOR_FLAG.taskOverdueDays} days overdue`, text: `A line manager action is more than ${MAJOR_FLAG.taskOverdueDays} days past its due date.` },
  { rule: "MANY_OVERDUE", label: `Over ${MAJOR_FLAG.manyOverdue} overdue actions`, text: `One line manager holds more than ${MAJOR_FLAG.manyOverdue} overdue actions across their starters.` },
  { rule: "DAY0_NEAR_START", label: "Day 0 not arranged", text: `The "Propose Day 0 arrangements" action is overdue and the starter's start date is within ${MAJOR_FLAG.day0WindowDays} days (or has passed).` },
];

export const MAJOR_FLAG_LABEL: Record<MajorFlagRule, string> = Object.fromEntries(MAJOR_FLAG_RULES.map((r) => [r.rule, r.label])) as Record<MajorFlagRule, string>;

/** The LM action that arranges the first day. */
export const DAY0_TASK_KEY = "propose-day-0-arrangements";

/** Early warning signals for active starters. */
export const EARLY_WARNING = {
  /** First Advantage has needed an action from the starter for more than this many days. */
  vettingActionDays: 3,
  /** The starter has done nothing in the app for more than this many days. */
  starterQuietDays: 7,
  /** Day 0 arrangements are still not agreed with this many days or fewer to the start date. */
  day0Days: 7,
} as const;

export type EarlySignalKind = "VETTING_ACTION" | "STARTER_QUIET" | "LM_OVERDUE" | "DAY0_NOT_ARRANGED";

export const EARLY_SIGNAL_RULES: { kind: EarlySignalKind; label: string; text: string }[] = [
  { kind: "VETTING_ACTION", label: "Vetting action needed", text: `First Advantage has been waiting on the starter for more than ${EARLY_WARNING.vettingActionDays} days.` },
  { kind: "STARTER_QUIET", label: "No starter activity", text: `The starter has not completed anything in the app for more than ${EARLY_WARNING.starterQuietDays} days (before Day 30).` },
  { kind: "LM_OVERDUE", label: "LM actions overdue", text: "The line manager has at least one overdue action for this starter." },
  { kind: "DAY0_NOT_ARRANGED", label: "Day 0 not arranged", text: `Day 0 arrangements are not agreed and the start date is ${EARLY_WARNING.day0Days} days away or less.` },
];

export const EARLY_SIGNAL_LABEL: Record<EarlySignalKind, string> = Object.fromEntries(EARLY_SIGNAL_RULES.map((r) => [r.kind, r.label])) as Record<EarlySignalKind, string>;

/** Intake readiness: "behind" means a start within this many days and readiness below this percentage. */
export const READINESS = { behindWithinDays: 14, behindBelowPct: 80 } as const;

/** Exit lead-time buckets, in display order. Keyed by days from exit to start date (negative: after the start). */
export const LEAD_BUCKETS: { key: string; label: string; test: (days: number) => boolean }[] = [
  { key: "after", label: "After the start date", test: (d) => d < 0 },
  { key: "0-7", label: "0 to 7 days before start", test: (d) => d >= 0 && d <= 7 },
  { key: "8-14", label: "8 to 14 days before start", test: (d) => d >= 8 && d <= 14 },
  { key: "15-30", label: "15 to 30 days before start", test: (d) => d >= 15 && d <= 30 },
  { key: "31-60", label: "31 to 60 days before start", test: (d) => d >= 31 && d <= 60 },
  { key: "60+", label: "More than 60 days before start", test: (d) => d > 60 },
];
