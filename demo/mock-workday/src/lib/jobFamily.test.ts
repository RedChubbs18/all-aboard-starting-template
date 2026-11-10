import { describe, expect, it } from "vitest";
import { deviceEntitlement, isJobFamily, JOB_FAMILIES, JOB_FAMILY_LABELS } from "./jobFamily";

describe("job family", () => {
  it("maps Engineering to the high-spec laptop and all others to standard", () => {
    expect(deviceEntitlement("ENGINEERING")).toBe("High-spec laptop: MacBook Pro M5 Pro or HP EliteBook U7");
    for (const f of JOB_FAMILIES.filter((x) => x !== "ENGINEERING")) expect(deviceEntitlement(f)).toBe("Standard laptop: MacBook Air M5 or HP EliteBook U5");
  });
  it("has a label for every family and a guard", () => {
    expect(JOB_FAMILIES.length).toBe(6);
    for (const f of JOB_FAMILIES) expect(JOB_FAMILY_LABELS[f]).toBeTruthy();
    expect(isJobFamily("OPERATIONS")).toBe(true);
    expect(isJobFamily("ops")).toBe(false);
  });
});
