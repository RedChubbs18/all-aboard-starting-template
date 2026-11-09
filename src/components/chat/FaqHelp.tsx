"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useApi } from "@/lib/auth/use-api";
import { ChatSheet, ContactPnpLink } from "./ChatSheet";
import { FAQ_TOPICS, filterFaqs, resultCountText, type FaqTopicKey } from "./faq-filter";
import type { FaqItem, PnpContact } from "./types";

type RawFaq = { id: string; question: string; answer: string; tags: unknown; sourceSlug?: string | null };

const focusRing =
  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-info focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const toItem = (f: RawFaq): FaqItem => ({
  id: f.id,
  question: f.question,
  answer: f.answer,
  tags: Array.isArray(f.tags) ? f.tags.map(String) : [],
  sourceSlug: f.sourceSlug ?? null,
});

/** Opens an FAQ accordion item by id, scrolls to it and focuses its summary. */
function revealFaq(id: string) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLDetailsElement)) return;
  el.open = true;
  el.scrollIntoView({ block: "start" });
  el.querySelector("summary")?.focus();
}

/** FR-1.7 help page: searchable FAQ accordion plus the "Ask the assistant" sheet. */
export function FaqHelp() {
  const { data, error, loading, reload } = useApi<{ faqs: RawFaq[] }>("/api/faqs");
  const { data: chatInfo } = useApi<{ contact: PnpContact | null }>("/api/chat");
  const contact = chatInfo?.contact ?? null;

  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<FaqTopicKey | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);
  /** Where focus goes when the sheet closes (default: back to the trigger). */
  const afterClose = useRef<(() => void) | null>(null);
  const hashHandled = useRef(false);
  const searchId = useId();

  const faqs = useMemo(() => (data?.faqs ?? []).map(toItem), [data]);
  const results = useMemo(() => filterFaqs(faqs, query, topic), [faqs, query, topic]);

  // Deep link (/faq#faq-12, used by assistant citations): open that item once data is loaded.
  useEffect(() => {
    if (hashHandled.current || !faqs.length) return;
    hashHandled.current = true;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) revealFaq(id);
  }, [faqs.length]);

  const handleClose = () => {
    setChatOpen(false);
    const next = afterClose.current ?? (() => askRef.current?.focus());
    afterClose.current = null;
    next();
  };

  const closeThen = (fn: () => void) => {
    afterClose.current = fn;
    setChatOpen(false);
  };

  const onCiteFaq = (id: string) => {
    setQuery("");
    setTopic(null);
    closeThen(() => {
      revealFaq(id);
      history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    });
  };

  const onSearchFaqs = () => closeThen(() => searchRef.current?.focus());

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-brand-strong">Help and FAQs</h1>
        <p className="mt-1 text-text-muted">Search common questions, or ask the assistant. Demo content for illustration only.</p>
      </div>

      <div role="search">
        <label htmlFor={searchId} className="block font-semibold">
          Search FAQs
        </label>
        <input
          id={searchId}
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          className="mt-1 min-h-12 w-full rounded-md border-2 border-border bg-surface px-3 text-base focus-visible:border-info focus-visible:outline-none"
        />
        <div role="group" aria-label="Filter by topic" className="mt-3 flex flex-wrap gap-2">
          {FAQ_TOPICS.map((t) => {
            const on = topic === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={on}
                onClick={() => setTopic(on ? null : t.key)}
                className={`inline-flex min-h-11 items-center gap-1 rounded-full border-2 px-4 text-sm font-semibold ${
                  on ? "border-brand bg-brand text-surface" : "border-border bg-surface text-text hover:bg-brand-soft"
                } ${focusRing}`}
              >
                {on && <span aria-hidden="true">✓</span>}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <p role="status" className="text-sm text-text-muted">
        {data ? resultCountText(results.length) : ""}
      </p>

      {loading && (
        <ul aria-hidden="true" className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-14 rounded-md bg-surface motion-safe:animate-pulse" />
          ))}
        </ul>
      )}
      {loading && <p className="sr-only">Loading FAQs…</p>}

      {error && (
        <div role="alert" className="rounded-md border-l-4 border-danger bg-[#fbe6e4] p-3">
          <p className="font-semibold text-danger">We couldn&apos;t load the FAQs.</p>
          <p className="text-sm text-text">{error}</p>
          <button type="button" onClick={reload} className={`mt-2 min-h-11 font-semibold text-brand underline underline-offset-2 ${focusRing}`}>
            Try again
          </button>
        </div>
      )}

      {data && results.length === 0 && (
        <div className="rounded-md bg-surface p-6 text-center shadow-card">
          <h2 className="text-lg font-semibold">No FAQs match</h2>
          <p className="mt-1 text-text-muted">Try different words, clear the topic filter, or ask the assistant.</p>
        </div>
      )}

      {results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((f) => (
            <li key={f.id}>
              <details id={f.id} className="group scroll-mt-4 rounded-md border border-border/40 bg-surface shadow-card">
                <summary
                  className={`flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-4 py-3 font-semibold hover:bg-brand-soft [&::-webkit-details-marker]:hidden ${focusRing}`}
                >
                  <span>{f.question}</span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="shrink-0 text-brand motion-safe:transition-transform group-open:rotate-180"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <div className="px-4 pb-4">
                  <p className="whitespace-pre-line">{f.answer}</p>
                  {f.sourceSlug && (
                    <Link
                      href={`/content/${encodeURIComponent(f.sourceSlug)}`}
                      className={`mt-2 inline-flex min-h-11 items-center text-brand underline underline-offset-2 ${focusRing}`}
                    >
                      Read more<span className="sr-only">: {f.question}</span>
                    </Link>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md bg-surface p-4 shadow-card">
        <h2 className="font-semibold">Still stuck?</h2>
        <p className="mt-1 text-sm text-text-muted">People &amp; Places (P&amp;P) can help with anything not covered here.</p>
        <div className="mt-2">
          <ContactPnpLink contact={contact} variant="secondary" />
        </div>
      </div>

      <div className="sticky bottom-20 z-30 md:bottom-4">
        <button
          ref={askRef}
          type="button"
          aria-haspopup="dialog"
          onClick={() => setChatOpen(true)}
          className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-base font-semibold text-surface shadow-card hover:bg-brand-strong ${focusRing}`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <path d="M4 5h16v11H9l-5 4z" />
          </svg>
          Ask the assistant
        </button>
      </div>

      <ChatSheet open={chatOpen} onClose={handleClose} contact={contact} onCiteFaq={onCiteFaq} onSearchFaqs={onSearchFaqs} />
    </div>
  );
}
