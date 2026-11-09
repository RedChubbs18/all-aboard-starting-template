import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import type { ChatAnswer, ChatbotAdapter } from "./types";

const STOP = new Set("a an the is are do does i my me to of for and or in on how what when where can we you it be at".split(" "));
const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Keyword-overlap retrieval over FAQs then content. Deterministic; WS6 swaps in an LLM. */
export function createChatbotMock(store: StateStore): ChatbotAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "chatbot", "ready", ["ready"]);
  return {
    ...m,
    key: "chatbot",
    async ask(question, corpus): Promise<ChatAnswer> {
      const q = new Set(tokens(question));
      const score = (text: string) => tokens(text).filter((t) => q.has(t)).length;
      const faqs = corpus.faqs
        .map((f) => ({ f, s: score(f.question) * 2 + score(`${f.answer} ${(f.tags ?? []).join(" ")}`) }))
        .filter((x) => x.s >= 2)
        .sort((a, b) => b.s - a.s);
      if (faqs.length) {
        const best = faqs[0].f;
        return { answer: best.answer, citations: [{ kind: "faq", id: best.id }], fallback: false };
      }
      const docs = corpus.content
        .map((c) => ({ c, s: score(c.title) * 2 + score(c.summary) }))
        .filter((x) => x.s >= 2)
        .sort((a, b) => b.s - a.s);
      if (docs.length) {
        const best = docs[0].c;
        return { answer: best.summary || best.title, citations: [{ kind: "content", id: best.slug }], fallback: false };
      }
      return {
        answer: "I could not find that in the onboarding guidance. Please contact People & Places.",
        citations: [],
        fallback: true,
      };
    },
  };
}
