import { describe, expect, it } from "vitest";
import { COLLEAGUE_REASONS, EXIT_REASONS, PNP_REASONS, REASON_LABEL, isExitReason, reasonLabel } from "./exit-reasons";
import { reasonLabel as miReasonLabel } from "@/components/mi/labels";

describe("exit reasons (D14)", () => {
  it("lists the 8 colleague and 3 P&P categories, each with a label", () => {
    expect(COLLEAGUE_REASONS).toHaveLength(8);
    expect(PNP_REASONS).toEqual(["FAILED_PEV", "OFFER_WITHDRAWN_BY_LBG", "NO_SHOW"]);
    expect(EXIT_REASONS).toHaveLength(11);
    for (const r of EXIT_REASONS) expect(REASON_LABEL[r]).toBeTruthy();
  });
  it("validates and labels, humanising legacy or unknown values", () => {
    expect(isExitReason("NO_SHOW")).toBe(true);
    expect(isExitReason("WITHDRAWN")).toBe(false);
    expect(reasonLabel("NO_SHOW")).toBe("No show");
    expect(reasonLabel("WITHDRAWN")).toBe("Withdrawn");
    expect(reasonLabel("Accepted another offer")).toBe("Accepted another offer");
    expect(reasonLabel(null)).toBe("Not recorded");
    expect(miReasonLabel).toBe(reasonLabel);
  });
});
