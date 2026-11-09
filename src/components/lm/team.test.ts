import { describe, expect, it } from "vitest";
import { teamChecklistItems } from "./team";

const t = (key: string, source: "CORE" | "TEAM" | "BESPOKE", dueDate = "2026-12-01T12:00:00.000Z") => ({ key, source, dueDate });

describe("team checklist visibility (F11)", () => {
  it("is hidden entirely when the starter has no TEAM tasks, even with recurring-calls tasks", () => {
    expect(teamChecklistItems([t("intro", "CORE"), t("forward-team-calls", "CORE"), t("x", "BESPOKE")])).toEqual([]);
  });
  it("shows TEAM tasks, plus the recurring-calls tasks, in due order", () => {
    const keys = teamChecklistItems([t("forward-team-calls", "CORE", "2026-11-01T12:00:00.000Z"), t("b", "TEAM", "2026-12-02T12:00:00.000Z"), t("a", "TEAM"), t("intro", "CORE")]).map((x) => x.key);
    expect(keys).toEqual(["forward-team-calls", "a", "b"]);
  });
});
