/** Deterministic helpers so mock data is stable per journey without being stored. Synthetic only. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const pick = <T,>(items: readonly T[], seed: string): T => items[hashString(seed) % items.length];

/** "Tuesday and Thursday" style label. */
export const joinDays = (days: readonly string[]): string =>
  days.length <= 1 ? (days[0] ?? "") : `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;
