/** Client-safe shapes for the FAQ page and chat sheet (mirror src/server/chat-service.ts). */
export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  sourceSlug: string | null;
}

export interface ChatCitation {
  kind: "faq" | "content";
  id: string;
  title: string;
  href: string;
}

export interface ChatReply {
  answer: string;
  fallback: boolean;
  citations: ChatCitation[];
}

export interface PnpContact {
  name: string;
  jobTitle: string | null;
  teamsUrl: string;
}

export const MAX_QUESTION_CHARS = 500;
