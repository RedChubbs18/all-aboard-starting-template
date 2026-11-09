/**
 * FR-1.7 chat service: loads the admin-managed corpus, rate-limits per user and asks the
 * chatbot adapter (mock or Claude). Single-turn and stateless: questions and answers are not
 * stored, and no user details are sent to the model.
 */
import { getAdapter } from "@/adapters/registry";
import { MAX_QUESTION_CHARS } from "@/adapters/chatbot/real";
import type { ChatCorpus, Citation } from "@/adapters/chatbot/types";
import { parseRoles } from "@/lib/auth/roles";
import { chatLink } from "@/lib/teams";
import { prisma } from "@/server/db";

export { MAX_QUESTION_CHARS };

const toTags = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export async function loadCorpus(): Promise<ChatCorpus> {
  const [faqs, content] = await Promise.all([
    prisma.faq.findMany({ orderBy: { id: "asc" } }),
    prisma.contentItem.findMany({ orderBy: { slug: "asc" } }),
  ]);
  return {
    faqs: faqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer, tags: toTags(f.tags) })),
    content: content.map((c) => ({ slug: c.slug, title: c.title, summary: c.summary, body: c.body })),
  };
}

export interface LinkedCitation extends Citation {
  title: string;
  href: string;
}

export interface ChatReply {
  answer: string;
  fallback: boolean;
  citations: LinkedCitation[];
}

/** Adds a display title and in-app link to each citation (unknown ids are dropped). */
export function linkCitations(citations: Citation[], corpus: ChatCorpus): LinkedCitation[] {
  const out: LinkedCitation[] = [];
  for (const c of citations) {
    if (c.kind === "faq") {
      const f = corpus.faqs.find((x) => x.id === c.id);
      if (f) out.push({ ...c, title: f.question, href: `/faq#${encodeURIComponent(f.id)}` });
    } else {
      const d = corpus.content.find((x) => x.slug === c.id);
      if (d) out.push({ ...c, title: d.title, href: `/content/${encodeURIComponent(d.slug)}` });
    }
  }
  return out;
}

export async function askAssistant(question: string): Promise<ChatReply> {
  const corpus = await loadCorpus();
  const bot = await getAdapter("chatbot");
  const r = await bot.ask(question.slice(0, MAX_QUESTION_CHARS), corpus);
  const citations = linkCitations(r.citations, corpus);
  // The UI must show a citation or the fallback card for every answer.
  return { answer: r.answer, fallback: r.fallback || citations.length === 0, citations };
}

// ------------------------------------------------------------ rate limiting

export const RATE_LIMIT = { max: 10, windowMs: 60_000 };
const hits = new Map<string, number[]>();

/** Sliding window, in memory (per server instance; fine for the local demo). */
export function takeRateLimit(userId: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (recent.length >= RATE_LIMIT.max) {
    hits.set(userId, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + RATE_LIMIT.windowMs - now) / 1000)) };
  }
  recent.push(now);
  hits.set(userId, recent);
  return { ok: true };
}

export function resetRateLimits() {
  hits.clear();
}

// ------------------------------------------------------------ P&P contact

export interface PnpContact {
  name: string;
  jobTitle: string | null;
  teamsUrl: string;
}

/** First P&P user (by id) as the "Contact P&P" fallback. Teams deep link only, no Graph. */
export async function getPnpContact(): Promise<PnpContact | null> {
  const users = await prisma.user.findMany({ orderBy: { id: "asc" }, select: { displayName: true, upn: true, jobTitle: true, roles: true } });
  const p = users.find((u) => parseRoles(u.roles).includes("PNP"));
  if (!p) return null;
  return {
    name: p.displayName,
    jobTitle: p.jobTitle,
    teamsUrl: chatLink(p.upn, { topicName: "Onboarding question" }),
  };
}
