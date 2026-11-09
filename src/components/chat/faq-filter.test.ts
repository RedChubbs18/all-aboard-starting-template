import { describe, expect, it } from "vitest";
import { filterFaqs, resultCountText } from "./faq-filter";
import type { FaqItem } from "./types";

const faqs: FaqItem[] = [
  { id: "f1", question: "When do I get paid?", answer: "Last working day.", tags: ["pay", "salary"], sourceSlug: null },
  { id: "f2", question: "Which laptop can I choose?", answer: "Mac or Windows.", tags: ["laptop", "device"], sourceSlug: "device" },
  { id: "f3", question: "What should I bring on my first day?", answer: "Your phone.", tags: ["first day"], sourceSlug: null },
];

describe("filterFaqs", () => {
  it("returns everything for an empty query", () => {
    expect(filterFaqs(faqs, "  ")).toHaveLength(3);
  });
  it("matches question, answer and tags, case-insensitively, all words", () => {
    expect(filterFaqs(faqs, "PAID").map((f) => f.id)).toEqual(["f1"]);
    expect(filterFaqs(faqs, "windows").map((f) => f.id)).toEqual(["f2"]);
    expect(filterFaqs(faqs, "salary").map((f) => f.id)).toEqual(["f1"]);
    expect(filterFaqs(faqs, "mac phone")).toEqual([]);
  });
  it("filters by topic chip and combines with the query", () => {
    expect(filterFaqs(faqs, "", "equipment").map((f) => f.id)).toEqual(["f2"]);
    expect(filterFaqs(faqs, "", "day1").map((f) => f.id)).toEqual(["f3"]);
    expect(filterFaqs(faqs, "paid", "equipment")).toEqual([]);
  });
  it("words the result count", () => {
    expect(resultCountText(1)).toBe("1 result");
    expect(resultCountText(0)).toBe("0 results");
  });
});
