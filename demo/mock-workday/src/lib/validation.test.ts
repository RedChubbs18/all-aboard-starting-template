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
  const base = { jobTitle: "Eng", teamKey: "t", lineManagerKey: "m", startDate: "2027-01-11", conditions: ["References"] };
  it("accepts good input", () => expect(validateOfferInput(base).ok).toBe(true));
  it("rejects bad dates and missing fields", () => {
    expect(validateOfferInput({ ...base, startDate: "11/01/2027" }).ok).toBe(false);
    expect(validateOfferInput({ ...base, jobTitle: "" }).ok).toBe(false);
    expect(validateOfferInput({ ...base, teamKey: "" }).ok).toBe(false);
  });
});
