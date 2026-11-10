/** Start-date rules (D27): a Monday, not in the past, within 3 months. All maths in UTC on YYYY-MM-DD strings. */
const DAY = 86_400_000;
export const MIN_LEAD_DAYS = 14;

const utcMidnight = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function addMonthsMs(ms: number, months: number): number {
  const d = new Date(ms);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months + 1, 0)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, Math.min(d.getUTCDate(), last));
}

/** All Mondays from `now + minLeadDays` up to `now + 3 months`. */
export function candidateMondays(now: Date = new Date(), minLeadDays = MIN_LEAD_DAYS): string[] {
  const today = utcMidnight(now);
  const end = addMonthsMs(today, 3);
  let t = today + minLeadDays * DAY;
  while (new Date(t).getUTCDay() !== 1) t += DAY;
  const out: string[] = [];
  for (; t <= end; t += 7 * DAY) out.push(iso(t));
  return out;
}

/** A random Monday at least 2 weeks out and within 3 months. `rand` is injectable for tests. */
export function randomMonday(now: Date = new Date(), rand: () => number = Math.random): string {
  const c = candidateMondays(now);
  return c[Math.min(c.length - 1, Math.floor(rand() * c.length))];
}

/** Returns an error message, or null when the date is a Monday between today and 3 months ahead. */
export function startDateError(s: string, now: Date = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "Start date must be a valid date.";
  const ms = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(ms) || iso(ms) !== s) return "Start date must be a valid date.";
  if (new Date(ms).getUTCDay() !== 1) return "Start date must be a Monday.";
  const today = utcMidnight(now);
  if (ms < today) return "Start date cannot be in the past.";
  if (ms > addMonthsMs(today, 3)) return "Start date must be within the next 3 months.";
  return null;
}
