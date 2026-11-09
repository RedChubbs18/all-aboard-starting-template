import { describe, expect, it } from "vitest";
import { detectCycles, renderMarkdownSafe, templateInputSchema, validateTemplateRules } from "./admin-validation";

const node = (key: string, ...dependsOn: string[]) => ({ key, dependsOn });

describe("detectCycles", () => {
  it("returns null for an acyclic graph (including diamonds)", () => {
    expect(detectCycles([node("a"), node("b", "a"), node("c", "a"), node("d", "b", "c")])).toBeNull();
  });
  it("finds a self loop", () => {
    expect(detectCycles([node("a", "a")])).toEqual(["a", "a"]);
  });
  it("finds a longer cycle and reports its path", () => {
    const c = detectCycles([node("x"), node("a", "b"), node("b", "c"), node("c", "a")])!;
    expect(c[0]).toBe(c[c.length - 1]);
    expect(new Set(c)).toEqual(new Set(["a", "b", "c"]));
  });
  it("ignores unknown keys", () => {
    expect(detectCycles([node("a", "ghost")])).toBeNull();
  });
});

const base = templateInputSchema.parse({ key: "new-one", title: "New one", stage: "PEV", owner: "STARTER", type: "ACTION", dueOffsetDays: -3 });
const existing = [
  { id: "1", key: "alpha", dependsOn: [] as string[] },
  { id: "2", key: "beta", dependsOn: ["alpha"] },
];

describe("validateTemplateRules", () => {
  it("accepts a valid template", () => {
    expect(validateTemplateRules({ ...base, dependsOn: ["alpha"], condition: "notDone:beta" }, existing)).toEqual({});
  });
  it("rejects a duplicate key but allows editing itself", () => {
    expect(validateTemplateRules({ ...base, key: "alpha" }, existing).key).toBeTruthy();
    expect(validateTemplateRules({ ...base, key: "alpha" }, existing, { selfId: "1" }).key).toBeUndefined();
  });
  it("rejects unknown dependencies and self dependency", () => {
    expect(validateTemplateRules({ ...base, dependsOn: ["nope"] }, existing).dependsOn).toMatch(/nope/);
    expect(validateTemplateRules({ ...base, dependsOn: ["new-one"] }, existing).dependsOn).toMatch(/itself/);
  });
  it("rejects a cycle introduced by an edit", () => {
    const errors = validateTemplateRules({ ...base, key: "alpha", dependsOn: ["beta"] }, existing, { selfId: "1" });
    expect(errors.dependsOn).toMatch(/cycle/i);
  });
  it("validates conditions", () => {
    expect(validateTemplateRules({ ...base, condition: "induction-not-booked" }, existing)).toEqual({});
    expect(validateTemplateRules({ ...base, condition: "done:alpha" }, existing)).toEqual({});
    expect(validateTemplateRules({ ...base, condition: "whenever" }, existing).condition).toBeTruthy();
    expect(validateTemplateRules({ ...base, condition: "done:ghost" }, existing).condition).toMatch(/ghost/);
  });
  it("requires a team for TEAM templates and none for CORE", () => {
    expect(validateTemplateRules({ ...base, source: "TEAM" }, existing).teamId).toBeTruthy();
    expect(validateTemplateRules({ ...base, source: "CORE", teamId: "t1" }, existing).teamId).toBeTruthy();
  });
  it("schema rejects bad enums and fractional offsets", () => {
    expect(templateInputSchema.safeParse({ ...base, stage: "NOPE" }).success).toBe(false);
    expect(templateInputSchema.safeParse({ ...base, dueOffsetDays: 1.5 }).success).toBe(false);
  });
});

describe("renderMarkdownSafe", () => {
  it("escapes raw HTML", () => {
    const html = renderMarkdownSafe('<script>alert(1)</script> <img src=x onerror="y()">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
  it("drops javascript: links but keeps https", () => {
    expect(renderMarkdownSafe("[x](javascript:alert(1))")).not.toContain("href");
    expect(renderMarkdownSafe("[ok](https://example.test/a)")).toContain('href="https://example.test/a"');
  });
  it("renders headings, lists and emphasis", () => {
    const html = renderMarkdownSafe("# Title\n\n- one\n- **two**\n\n1. a");
    expect(html).toContain("<h3>Title</h3>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<strong>two</strong>");
    expect(html).toContain("<ol>");
  });
});
