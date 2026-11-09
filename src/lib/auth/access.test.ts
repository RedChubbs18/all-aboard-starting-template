import { describe, expect, it } from "vitest";
import { canActOnTask, canManageJourney, canViewJourney, journeyScopeWhere } from "./access";
import { navFor, homePathFor } from "./roles";

const j = { starterId: "s1", lmId: "lm1", buddyId: "b1" };
const u = (id: string, ...roles: ("STARTER" | "BUDDY" | "LM" | "PNP" | "ADMIN")[]) => ({ id, roles });

describe("journey access", () => {
  it("starter sees only their own journey", () => {
    expect(canViewJourney(u("s1", "STARTER"), j)).toBe(true);
    expect(canViewJourney(u("s2", "STARTER"), j)).toBe(false);
  });
  it("LM sees only journeys where lmId = self", () => {
    expect(canViewJourney(u("lm1", "LM"), j)).toBe(true);
    expect(canViewJourney(u("lm2", "LM"), j)).toBe(false);
  });
  it("buddy is read-only on their allocated starter", () => {
    expect(canViewJourney(u("b1", "BUDDY"), j)).toBe(true);
    expect(canViewJourney(u("b2", "BUDDY"), j)).toBe(false);
    expect(canManageJourney(u("b1", "BUDDY"), j)).toBe(false);
    expect(canActOnTask(u("b1", "BUDDY"), j, "STARTER")).toBe(false);
    expect(canActOnTask(u("b1", "BUDDY"), j, "LM")).toBe(false);
  });
  it("PNP and ADMIN see and manage all", () => {
    for (const r of ["PNP", "ADMIN"] as const) {
      expect(canViewJourney(u("x", r), j)).toBe(true);
      expect(canManageJourney(u("x", r), j)).toBe(true);
      expect(canActOnTask(u("x", r), j, "SYSTEM")).toBe(true);
    }
  });
  it("multi-role users get the union", () => {
    const both = u("b1", "BUDDY", "LM");
    expect(canViewJourney(both, j)).toBe(true);
    expect(canViewJourney(both, { ...j, buddyId: null, lmId: "other" })).toBe(false);
  });
  it("starters act only on STARTER-owned tasks; SYSTEM tasks are integration-only", () => {
    expect(canActOnTask(u("s1", "STARTER"), j, "STARTER")).toBe(true);
    expect(canActOnTask(u("s1", "STARTER"), j, "LM")).toBe(false);
    expect(canActOnTask(u("lm1", "LM"), j, "SYSTEM")).toBe(false);
    expect(canActOnTask(u("lm1", "LM"), j, "LM")).toBe(true);
  });
  it("scopes list queries", () => {
    expect(journeyScopeWhere(u("x", "ADMIN"))).toEqual({});
    expect(journeyScopeWhere(u("lm1", "LM"))).toEqual({ OR: [{ lmId: "lm1" }] });
    expect(journeyScopeWhere(u("n", "BUDDY", "STARTER"))).toEqual({ OR: [{ buddyId: "n" }, { starterId: "n" }] });
    expect(journeyScopeWhere({ id: "z", roles: [] })).toEqual({ id: "__none__" });
  });
});

describe("nav", () => {
  it("shows links by role", () => {
    expect(navFor(u("a", "STARTER")).map((n) => n.href)).toEqual(["/journey", "/team", "/faq"]);
    expect(navFor(u("a", "LM")).map((n) => n.href)).toContain("/lm");
    expect(navFor(u("a", "LM")).map((n) => n.href)).not.toContain("/mi");
    expect(navFor(u("a", "ADMIN")).map((n) => n.href)).toContain("/admin");
    expect(homePathFor(u("a", "PNP"))).toBe("/mi");
  });
});
