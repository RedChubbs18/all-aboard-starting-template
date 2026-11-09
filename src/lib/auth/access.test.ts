import { describe, expect, it } from "vitest";
import { canActOnTask, canManageJourney, canViewJourney, journeyScopeWhere, taskVisibleInScope, viewScope } from "./access";
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

describe("photo-check-override (D12)", () => {
  const key = "photo-check-override";
  it("the journey's LM and PNP can complete it; other LMs, starters, buddies cannot", () => {
    expect(canActOnTask(u("lm1", "LM"), j, "PNP", key)).toBe(true);
    expect(canActOnTask(u("p", "PNP"), j, "PNP", key)).toBe(true);
    expect(canActOnTask(u("lm2", "LM"), j, "PNP", key)).toBe(false);
    expect(canActOnTask(u("s1", "STARTER"), j, "PNP", key)).toBe(false);
    expect(canActOnTask(u("b1", "BUDDY"), j, "PNP", key)).toBe(false);
  });
  it("does not widen LM access to other PNP-owned tasks", () => {
    expect(canActOnTask(u("lm1", "LM"), j, "PNP", "offer-conditions-met")).toBe(false);
    expect(canActOnTask(u("lm1", "LM"), j, "PNP")).toBe(false);
  });
});

describe("nav and admin guards", () => {
  it("PNP and ADMIN get Simulate; only PNP gets the direct Record exit link", () => {
    const pnp = navFor(u("p", "PNP")).map((n) => n.href);
    expect(pnp).toEqual(expect.arrayContaining(["/admin/simulate", "/admin/journeys"]));
    expect(pnp).not.toContain("/admin");
    const admin = navFor(u("a", "ADMIN")).map((n) => n.href);
    expect(admin).toContain("/admin/simulate");
    expect(admin).not.toContain("/admin/journeys");
    expect(navFor(u("l", "LM")).map((n) => n.href)).not.toContain("/admin/simulate");
  });
});

describe("F10 / F16 buddy scope", () => {
  const buddy = u("b1", "BUDDY");
  it("buddy can complete LM-owned IT request tasks, but not other LM tasks", () => {
    expect(canActOnTask(buddy, j, "LM", "raise-it-requests", "itrequest")).toBe(true);
    expect(canActOnTask(buddy, j, "LM", "allocate-buddy", null)).toBe(false);
    expect(canActOnTask(u("b2", "BUDDY"), j, "LM", "raise-it-requests", "itrequest")).toBe(false);
    expect(canActOnTask(u("s1", "STARTER"), j, "LM", "raise-it-requests", "itrequest")).toBe(false);
  });
  it("viewScope and task visibility: starter sees STARTER and SYSTEM only; buddy only their own", () => {
    const tasks = [
      { owner: "STARTER" as const, key: "a" },
      { owner: "SYSTEM" as const, key: "b" },
      { owner: "LM" as const, key: "c" },
      { owner: "BUDDY" as const, key: "d" },
      { owner: "PNP" as const, key: "e" },
      { owner: "LM" as const, key: "raise-it-requests", adapterKey: "itrequest" },
    ];
    const starter = u("s1", "STARTER");
    expect(viewScope(starter, j)).toBe("STARTER");
    expect(tasks.filter((t) => taskVisibleInScope("STARTER", starter, j, t)).map((t) => t.key)).toEqual(["a", "b"]);
    expect(viewScope(buddy, j)).toBe("BUDDY");
    expect(tasks.filter((t) => taskVisibleInScope("BUDDY", buddy, j, t)).map((t) => t.key)).toEqual(["d", "raise-it-requests"]);
    expect(viewScope(u("lm1", "LM"), j)).toBe("FULL");
  });
});
