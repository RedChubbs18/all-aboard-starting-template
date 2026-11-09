import type { FaqItem } from "./types";

/** Quick topic chips on the FAQ page (screens.md §4). A chip matches any of its tags. */
export const FAQ_TOPICS = [
  { key: "pay", label: "Pay", tags: ["pay", "pay day", "payday", "salary", "payslip"] },
  { key: "benefits", label: "Benefits", tags: ["benefits", "flex", "flex benefits", "holiday", "annual leave"] },
  { key: "equipment", label: "Equipment", tags: ["equipment", "laptop", "device", "monitor", "peripherals", "desk"] },
  { key: "day1", label: "Day 1", tags: ["day one", "first day", "day 0", "induction", "what to bring"] },
] as const;
export type FaqTopicKey = (typeof FAQ_TOPICS)[number]["key"];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Every search word must appear in the question, answer or tags (case-insensitive). */
export function filterFaqs(faqs: FaqItem[], query: string, topic: FaqTopicKey | null = null): FaqItem[] {
  const words = norm(query).split(" ").filter(Boolean);
  const topicTags: readonly string[] = topic ? (FAQ_TOPICS.find((t) => t.key === topic)?.tags ?? []) : [];
  return faqs.filter((f) => {
    const tags = f.tags.map(norm);
    if (topicTags.length && !tags.some((t) => topicTags.includes(t))) return false;
    if (!words.length) return true;
    const hay = norm(`${f.question} ${f.answer} ${tags.join(" ")}`);
    return words.every((w) => hay.includes(w));
  });
}

export const resultCountText = (n: number) => (n === 1 ? "1 result" : `${n} results`);
