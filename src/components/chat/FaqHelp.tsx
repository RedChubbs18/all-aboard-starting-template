"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, MessageCircle, Search } from "lucide-react";
import { useApi } from "@/lib/auth/use-api";
import { buttonClass } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Alert } from "@/components/ui/Alert";
import { ChatSheet, ContactPnpLink } from "./ChatSheet";
import { FAQ_TOPICS, filterFaqs, resultCountText, type FaqTopicKey } from "./faq-filter";
import type { FaqItem, PnpContact } from "./types";

type RawFaq = { id: string; question: string; answer: string; tags: unknown; sourceSlug?: string | null };


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
  const askDesktopRef = useRef<HTMLButtonElement>(null);
  /** Where focus goes when the sheet closes (default: back to the trigger). */
  const afterClose = useRef<(() => void) | null>(null);
  const hashHandled = useRef(false);
  const searchId = useId();

  const faqs = useMemo(() => (data?.faqs ?? []).map(toItem), [data]);
  const results = useMemo(() => filterFaqs(faqs, query, topic), [faqs, query, topic]);

  // The result count is announced ~500ms after typing stops, not on every keystroke.
  const countText = data ? resultCountText(results.length) : "";
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setAnnounced(countText), 500);
    return () => clearTimeout(t);
  }, [countText]);

  // Deep link (/faq#faq-12, used by assistant citations): open that item once data is loaded.
  useEffect(() => {
    if (hashHandled.current || !faqs.length) return;
    hashHandled.current = true;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) revealFaq(id);
  }, [faqs.length]);

  const handleClose = () => {
    setChatOpen(false);
    // Two triggers exist (sticky on phones, in the side column from 1024px): return focus to the visible one.
    const next = afterClose.current ?? (() => (askDesktopRef.current?.offsetParent ? askDesktopRef.current : askRef.current)?.focus());
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
        <h1 className="text-[1.75rem] font-bold leading-tight text-ink">Help and FAQs</h1>
        <p className="mt-1 text-muted">Search common questions, or ask the assistant. Demo content for illustration only.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-col gap-4">
      <div role="search">
        <label htmlFor={searchId} className="block text-sm font-semibold">
          Search FAQs
        </label>
        <div className="relative mt-1">
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" strokeWidth={1.8} />
          <input
            id={searchId}
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            placeholder="Search questions"
            className="min-h-12 w-full rounded-md border border-line-strong bg-card py-3 pl-11 pr-4 text-base placeholder:text-muted"
          />
        </div>
        <ChipRow label="Filter by topic" className="mt-3">
          {FAQ_TOPICS.map((t) => {
            const on = topic === t.key;
            return (
              <Chip key={t.key} selected={on} onClick={() => setTopic(on ? null : t.key)}>
                {t.label}
              </Chip>
            );
          })}
        </ChipRow>
      </div>

      <p aria-hidden="true" className="text-sm text-muted">
        {countText}
      </p>
      <p role="status" className="sr-only">
        {announced}
      </p>

      {loading && (
        <ul aria-hidden="true" className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-14 rounded-md bg-card motion-safe:animate-pulse" />
          ))}
        </ul>
      )}
      {loading && <p className="sr-only">Loading FAQs…</p>}

      {error && (
        <Alert tone="danger" live="alert" title="We couldn't load the FAQs.">
          <p className="text-sm">{error}</p>
          <button type="button" onClick={reload} className="mt-2 min-h-11 font-semibold text-brand-strong underline underline-offset-2">
            Try again
          </button>
        </Alert>
      )}
      {data && results.length === 0 && (
        <div className="rounded-md border border-line bg-card p-6 text-center">
          <h2 className="text-lg font-bold">No FAQs match</h2>
          <p className="mt-1 text-muted">Try different words, clear the topic filter, or ask the assistant.</p>
        </div>
      )}

      {results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((f) => (
            <li key={f.id}>
              <details id={f.id} className="group scroll-mt-4 rounded-md border border-line bg-card">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-[22px] py-3 font-bold hover:bg-page [&::-webkit-details-marker]:hidden">
                  <span>{f.question}</span>
                  <ChevronDown aria-hidden className="size-5 shrink-0 text-muted motion-safe:transition-transform group-open:rotate-180" strokeWidth={1.8} />
                </summary>
                <div className="px-[22px] pb-4">
                  <p className="whitespace-pre-line text-muted">{f.answer}</p>
                  {f.sourceSlug && (
                    <Link
                      href={`/content/${encodeURIComponent(f.sourceSlug)}`}
                      className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-2"
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

      </div>

      <aside aria-label="Get more help" className="flex flex-col gap-4 lg:sticky lg:top-24">
        <div className="hidden lg:block">
          <button
            ref={askDesktopRef}
            type="button"
            aria-haspopup="dialog"
            onClick={() => setChatOpen(true)}
            className={buttonClass("primary", "lg", "w-full")}
          >
            <MessageCircle aria-hidden className="size-5" strokeWidth={1.8} />
            Ask the assistant
          </button>
          <p className="mt-2 text-sm text-muted">Answers come from onboarding content. The assistant opens in a panel beside this page.</p>
        </div>
        <div className="rounded-md border border-line bg-card px-[22px] py-5">
        <h2 className="text-lg font-bold">Still stuck?</h2>
        <p className="mt-1 text-sm text-muted">People &amp; Places (P&amp;P) can help with anything not covered here.</p>
        <div className="mt-2">
          <ContactPnpLink contact={contact} variant="secondary" />
        </div>
      </div>

      </aside>
      </div>

      <div className="sticky bottom-[88px] z-30 md:bottom-4 lg:hidden">
        <button
          ref={askRef}
          type="button"
          aria-haspopup="dialog"
          onClick={() => setChatOpen(true)}
          className={buttonClass("primary", "lg", "w-full")}
        >
          <MessageCircle aria-hidden className="size-5" strokeWidth={1.8} />
          Ask the assistant
        </button>
      </div>

      <ChatSheet open={chatOpen} onClose={handleClose} contact={contact} onCiteFaq={onCiteFaq} onSearchFaqs={onSearchFaqs} />
    </div>
  );
}
