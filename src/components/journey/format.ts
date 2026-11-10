import { dayStart, isPastDue } from "@/domain/stage-timing";

const TZ = "UTC"; // due dates are stored as UTC midnight; formatting in UTC keeps the day stable

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts });

/** "Fri 20 Nov" */
export const formatShortDate = (iso: string) => fmt({ weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
/** "Friday 20 November" */
export const formatLongDate = (iso: string) => fmt({ weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
/** "14 December" */
export const formatDayMonth = (iso: string) => fmt({ day: "numeric", month: "long" }).format(new Date(iso));
/** "Mon 7 Dec 2026, 09:30" in UK local time (meeting and session times, not due dates). */
export const formatDateTime = (iso: string) =>
  fmt({ weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(
    new Date(iso),
  );


/** Overdue = due date is before today (the due day itself is not overdue). */
export function isOverdue(dueIso: string, now: Date): boolean {
  return isPastDue(new Date(dueIso), now);
}

/**
 * D32 timing for the vetting task before the colleague has been invited: "Due soon" (within a week, or already due)
 * or "Due Fri 20 Nov". Deliberately says nothing about First Advantage's status.
 */
export function vettingTiming(dueIso: string, now: Date): string {
  const days = (dayStart(new Date(dueIso)) - dayStart(now)) / 86_400_000;
  return days <= 7 ? "Due soon" : `Due ${formatShortDate(dueIso)}`;
}
