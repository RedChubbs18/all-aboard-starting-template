import { describe, expect, it } from "vitest";
import { applyVars, extractSteps, findLabelledUrl, formatDays, parseMarkdown, safeHref } from "./markdown";

describe("anchor-days substitution", () => {
  it("formats days from the Workday adapter in plain English", () => {
    expect(formatDays(["Tuesday", "Thursday"])).toBe("Tuesday and Thursday");
    expect(formatDays(["Monday", "Wednesday", "Friday"])).toBe("Monday, Wednesday and Friday");
    expect(formatDays(["Tuesday"])).toBe("Tuesday");
    expect(formatDays([])).toMatch(/to be confirmed/);
  });
  it("replaces {{anchorDays}} and leaves unknown variables alone", () => {
    expect(applyVars("- **Anchor days:** {{anchorDays}} and {{other}}", { anchorDays: "Tuesday and Thursday" })).toBe(
      "- **Anchor days:** Tuesday and Thursday and {{other}}",
    );
  });
  it("parses the variable as its own node so the page can fill it in client-side", () => {
    const [b] = parseMarkdown("Anchor days: {{anchorDays}}");
    expect(b).toMatchObject({ t: "p" });
    expect(JSON.stringify(b)).toContain('"t":"var","name":"anchorDays"');
  });
});

describe("safe markdown", () => {
  it("never produces html nodes: tags stay as text", () => {
    const blocks = parseMarkdown("<script>alert(1)</script> and <img src=x onerror=alert(1)>");
    expect(JSON.stringify(blocks)).toContain("<script>");
    expect(blocks.every((b) => ["p", "heading", "ul", "ol", "quote", "hr", "table"].includes(b.t))).toBe(true);
  });
  it("drops unsafe link schemes", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("//evil.example/x")).toBeNull();
    expect(safeHref("/\\evil.example/x")).toBeNull();
    expect(safeHref("/content/x")).toBe("/content/x");
    expect(safeHref("//evil.test")).toBeNull();
    expect(safeHref("https://example.test/x")).toBe("https://example.test/x");
    expect(safeHref("/content/a")).toBe("/content/a");
    const [p] = parseMarkdown("[click](javascript:alert(1))");
    expect(JSON.stringify(p)).not.toContain("javascript");
  });
  it("parses tables, lists and steps", () => {
    const md = "## T\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n1. One\n2. Two **bold**\n\n- x";
    const kinds = parseMarkdown(md).map((b) => b.t);
    expect(kinds).toEqual(["heading", "table", "ol", "ul"]);
    expect(extractSteps(md)).toEqual(["One", "Two bold"]);
  });
  it("finds a labelled video url", () => {
    expect(findLabelledUrl("**Video URL:** `https://example.test/v.mp4`\nmore", "Video URL")).toBe("https://example.test/v.mp4");
  });
});
