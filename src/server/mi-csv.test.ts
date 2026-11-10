import { describe, expect, it } from "vitest";
import { csvCell, earlyWarningCsv, exitsCsv, lmFlagsCsv, lmLeagueCsv, toCsv } from "./mi-csv";
import type { Overview } from "./mi-service";

describe("csvCell", () => {
  it("prefixes formula triggers so spreadsheets treat them as text", () => {
    for (const bad of ["=1+1", "+44 1", "-2+3", "@SUM(A1)", "\tcmd", "\rx"]) {
      expect(csvCell(bad).replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
  });
  it("leaves real numbers and safe text untouched", () => {
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(4.5)).toBe("4.5");
    expect(csvCell("Alex Morgan")).toBe("Alex Morgan");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("quotes commas, quotes and newlines and doubles quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("toCsv", () => {
  it("joins with CRLF and ends with a newline", () => {
    expect(toCsv(["A", "B"], [[1, "x,y"]])).toBe('A,B\r\n1,"x,y"\r\n');
  });
  it("exports only name, work email and journey facts for exits", () => {
    const out = exitsCsv([{ journeyId: "j1", starterName: "=Evil", workEmail: "a@example.test", stage: "PEV", reason: "NO_SHOW", reasonSource: "PNP", comment: "call me on 0700", exitedAt: "2026-11-01T10:00:00.000Z" }]);
    expect(out.split("\r\n")[0]).toBe("Starter,Work email,Stage reached,Reason,Reason source,Exit date");
    expect(out).toContain("'=Evil,a@example.test,Pre-employment vetting,No show,P&P,2026-11-01");
    expect(out).not.toContain("0700");
    const withC = exitsCsv([{ journeyId: "j1", starterName: "A", workEmail: "a@example.test", stage: "PEV", reason: "OTHER", reasonSource: "COLLEAGUE", comment: "hello", exitedAt: null }], { includeComments: true });
    expect(withC.split("\r\n")[0]).toContain("Comment");
    expect(withC).toContain("hello");
    expect(out).not.toContain("j1");
  });
});

describe("section CSVs", () => {
  it("neutralise formula triggers in names and titles", () => {
    const o = {
      lm: {
        league: [{ lmName: "=cmd", teams: ["@Team"], areas: [], activeStarters: 1, openActions: 1, overdueActions: 1, avgDaysOverdue: 2, onTimePct: 50, oldestOverdue: { title: "+x", starterName: "-y", days: 2 }, lastChasedAt: null, chaseCount: 0, flagRules: ["TASK_OVERDUE"] }],
        flags: [{ lmName: "=cmd", teamName: "T", area: null, starterName: "@s", title: "+t", daysOverdue: 6, rules: ["TASK_OVERDUE"], detail: "6 days overdue" }],
      },
      attrition: { earlyWarning: [{ starterName: "=s", teamName: "T", lmName: "L", stage: "PEV", startDate: "2026-12-01T00:00:00.000Z", daysToStart: 20, level: "HIGH", signals: [{ kind: "LM_OVERDUE", detail: "1 LM action overdue" }] }] },
    } as unknown as Overview;
    expect(lmLeagueCsv(o)).toContain("'=cmd,'@Team");
    expect(lmFlagsCsv(o)).toContain("'=cmd,T,,'@s,'+t,6,Over 5 days overdue,6 days overdue");
    expect(earlyWarningCsv(o)).toContain("'=s,T,L,Pre-employment vetting,2026-12-01,20,High,LM actions overdue (1 LM action overdue)");
  });
});
