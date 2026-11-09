import type { BaseAdapter } from "../types";

export interface Citation {
  kind: "faq" | "content";
  /** Faq.id or ContentItem.slug */
  id: string;
}

export interface ChatAnswer {
  answer: string;
  citations: Citation[];
  /** True when nothing relevant was found: UI offers "contact P&P". */
  fallback: boolean;
}

export interface ChatCorpus {
  faqs: { id: string; question: string; answer: string; tags?: string[] }[];
  content: { slug: string; title: string; summary: string; body: string }[];
}

/** FR-1.7: answers ONLY from admin-managed FAQ + content, always citing sources. */
export interface ChatbotAdapter extends BaseAdapter {
  key: "chatbot";
  /** `corpus` is supplied by the caller (loaded from DB) so the adapter stays DB-free. */
  ask(question: string, corpus: ChatCorpus): Promise<ChatAnswer>;
}
