import { describe, expect, it } from "vitest";
import { isValidEmail, validateCandidate, validateOfferInput } from "./validation";

const ok = { firstName: "Jo", lastName: "O'Neil-Bloggs", email: "jo@example.com", confirmEmail: "JO@example.com", accepted: true };

describe("candidate validation", () => {
  it("accepts a valid candidate (confirm email is case-insensitive)", () => {
    expect(validateCandidate(ok)).toEqual({ ok: true, value: { firstName: "Jo", lastName: "O'Neil-Bloggs", email: "jo@example.com" } });
  });
  it("rejects bad emails, mismatches, missing acceptance and names", () => {
    const r = validateCandidate({ firstName: "", lastName: "x1", email: "nope", confirmEmail: "other", accepted: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["accepted", "confirmEmail", "email", "firstName", "lastName"]);
  });
  it("rejects non-object input", () => {
    expect(validateCandidate(null).ok).toBe(false);
  });
  it("email format", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.com")).toBe(false);
  });
});

describe("offer input validation", () => {
  const now = new Date("2026-11-10T09:00:00Z");
  const base = { jobTitle: "Eng", jobFamily: "ENGINEERING", teamKey: "t", lineManagerKey: "m", startDate: "2027-01-11", conditions: ["References"] };
  it("accepts good input", () => {
    const r = validateOfferInput(base, now);
    expect(r.ok && r.value.jobFamily).toBe("ENGINEERING");
  });
  it("requires a known job family", () => {
    expect(validateOfferInput({ ...base, jobFamily: undefined }, now).ok).toBe(false);
    expect(validateOfferInput({ ...base, jobFamily: "SALES" }, now).ok).toBe(false);
    expect(validateOfferInput({ ...base, jobFamily: "CORPORATE_FUNCTIONS" }, now).ok).toBe(true);
  });
  it("enforces Monday within 3 months server-side", () => {
    expect(validateOfferInput({ ...base, startDate: "2027-01-12" }, now).ok).toBe(false);
    expect(validateOfferInput({ ...base, startDate: "2026-11-02" }, now).ok).toBe(false);
    expect(validateOfferInput({ ...base, startDate: "2027-03-01" }, now).ok).toBe(false);
  });
  it("rejects bad dates and missing fields", () => {
    expect(validateOfferInput({ ...base, startDate: "11/01/2027" }, now).ok).toBe(false);
    expect(validateOfferInput({ ...base, jobTitle: "" }, now).ok).toBe(false);
    expect(validateOfferInput({ ...base, teamKey: "" }, now).ok).toBe(false);
  });
});
