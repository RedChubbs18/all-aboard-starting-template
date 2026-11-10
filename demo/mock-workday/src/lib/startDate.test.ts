import { describe, expect, it } from "vitest";
import { candidateMondays, randomMonday, startDateError } from "./startDate";

const DAY = 86_400_000;
const now = new Date("2026-11-10T09:00:00Z"); // a Tuesday

describe("randomMonday", () => {
  it("is always a Monday, at least 2 weeks out and within 3 months", () => {
    for (let k = 0; k < 400; k++) {
      const start = new Date(now.getTime() + k * 3 * DAY + (k % 7) * 3_600_000);
      const m = randomMonday(start, () => (k * 0.37) % 1);
      const ms = Date.parse(`${m}T00:00:00Z`);
      const today = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
      expect(new Date(ms).getUTCDay()).toBe(1);
      expect(ms - today).toBeGreaterThanOrEqual(14 * DAY);
      expect(startDateError(m, start)).toBeNull();
    }
  });
  it("covers the range via the injected random source", () => {
    const all = candidateMondays(now);
    expect(randomMonday(now, () => 0)).toBe(all[0]);
    expect(randomMonday(now, () => 0.999999)).toBe(all[all.length - 1]);
    expect(all[0]).toBe("2026-11-30");
    expect(all[all.length - 1]).toBe("2027-02-08");
  });
  it("uses the real random source by default", () => {
    expect(startDateError(randomMonday())).toBeNull();
  });
});

describe("startDateError", () => {
  it("accepts a Monday in range", () => expect(startDateError("2027-01-11", now)).toBeNull());
  it("rejects non-Mondays, past, too far out and malformed dates", () => {
    expect(startDateError("2027-01-12", now)).toMatch(/Monday/);
    expect(startDateError("2026-11-09", now)).toMatch(/past/);
    expect(startDateError("2027-02-15", now)).toMatch(/3 months/);
    expect(startDateError("2027-02-30", now)).toMatch(/valid/);
    expect(startDateError("11/01/2027", now)).toMatch(/valid/);
  });
});
