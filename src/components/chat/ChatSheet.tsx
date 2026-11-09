"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useSession } from "@/lib/auth/client";
import { buttonClass } from "@/components/ui/Button";
import { controlClass } from "@/components/ui/Field";
import { MAX_QUESTION_CHARS, type ChatCitation, type ChatReply, type PnpContact } from "./types";

type NewMsg = { role: "user"; text: string } | { role: "bot"; reply: ChatReply } | { role: "error"; text: string };
type Msg = NewMsg & { id: number };

const btnPrimary = buttonClass("primary");
const btnSecondary = buttonClass("secondary");

/** "Contact P&P" Teams deep link (src/lib/teams.ts, built server-side). */
export function ContactPnpLink({ contact, variant = "secondary" }: { contact: PnpContact | null; variant?: "primary" | "secondary" | "text" }) {
  if (!contact) {
    return <p className="text-sm text-muted">Contact P&amp;P through your line manager.</p>;
  }
  const cls = variant === "primary" ? btnPrimary : variant === "secondary" ? btnSecondary : "inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-2";
  return (
    <a href={contact.teamsUrl} target="_blank" rel="noopener noreferrer" className={cls}>
      Contact P&amp;P on Teams
      <span className="sr-only">
        {" "}
        ({contact.name}, opens in a new tab)
      </span>
    </a>
  );
}

function Citations({ items, onCiteFaq }: { items: ChatCitation[]; onCiteFaq: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="text-sm font-semibold text-muted">Sources</p>
      <ul className="mt-1 flex flex-wrap gap-2">
        {items.map((c) => (
          <li key={`${c.kind}:${c.id}`}>
            {c.kind === "faq" ? (
              <a
                href={c.href}
                onClick={(e) => {
                  e.preventDefault();
                  onCiteFaq(c.id);
                }}
                className={`inline-flex min-h-11 items-center rounded-full border border-line bg-card px-3.5 text-sm font-semibold text-brand-strong underline underline-offset-2 hover:bg-brand-tint`}
              >
                <span className="sr-only">FAQ: </span>
                {c.title}
              </a>
            ) : (
              <Link
                href={c.href}
                className={`inline-flex min-h-11 items-center rounded-full border border-line bg-card px-3.5 text-sm font-semibold text-brand-strong underline underline-offset-2 hover:bg-brand-tint`}
              >
                <span className="sr-only">Guide: </span>
                {c.title}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FallbackCard({ contact, onSearchFaqs, title }: { contact: PnpContact | null; onSearchFaqs: () => void; title: string }) {
  return (
    <div className="mt-3 rounded-md border-l-4 border-mixed bg-mixed-tint p-3">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink">People &amp; Places (P&amp;P) can help with anything not covered here.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <ContactPnpLink contact={contact} variant="primary" />
        <button type="button" onClick={onSearchFaqs} className={btnSecondary}>
          Search FAQs
        </button>
      </div>
    </div>
  );
}

export interface ChatSheetProps {
  open: boolean;
  onClose: () => void;
  contact: PnpContact | null;
  /** Called when an FAQ citation is chosen: the page closes the sheet and opens that FAQ. */
  onCiteFaq: (faqId: string) => void;
  /** Close the sheet and move focus to the FAQ search box. */
  onSearchFaqs: () => void;
}

/**
 * FR-1.7 assistant sheet. Native modal <dialog>: background is inert (focus stays inside),
 * Esc closes, focus returns to the trigger (handled by the caller via onClose).
 * Bottom sheet on mobile, 420px right drawer from lg.
 */
export function ChatSheet({ open, onClose, contact, onCiteFaq, onSearchFaqs }: ChatSheetProps) {
  const { apiFetch } = useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const titleId = useId();
  const noticeId = useId();
  const inputId = useId();
  const countId = useId();

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      inputRef.current?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  const push = (m: NewMsg) => {
    const id = nextId.current++;
    setMessages((prev) => [...prev, { ...m, id }]);
  };

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const question = draft.trim();
    if (!question || pending) return;
    setDraft("");
    push({ role: "user", text: question });
    setPending(true);
    try {
      const r = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (r.ok) {
        push({ role: "bot", reply: (await r.json()) as ChatReply });
      } else {
        const body = (await r.json().catch(() => ({}))) as { message?: string };
        push({ role: "error", text: r.status === 429 || r.status === 400 ? (body.message ?? "Please try again.") : "The assistant is unavailable right now." });
      }
    } catch {
      push({ role: "error", text: "The assistant is unavailable right now." });
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  const remaining = MAX_QUESTION_CHARS - draft.length;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={noticeId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose(); // backdrop click
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 h-[90dvh] max-h-[90dvh] w-full max-w-none flex-col rounded-t-lg bg-card p-0 text-ink backdrop:bg-ink/50 open:flex lg:inset-y-0 lg:left-auto lg:right-0 lg:h-dvh lg:max-h-dvh lg:w-[420px] lg:rounded-none lg:rounded-l-lg"
    >
      <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong lg:hidden" />
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <h2 id={titleId} className="text-xl font-bold">
          Ask the assistant
        </h2>
        <button type="button" onClick={onClose} className={buttonClass("ghost", "icon")}>
          <X aria-hidden className="size-5" strokeWidth={1.8} />
          <span className="sr-only">Close assistant</span>
        </button>
      </div>

      <p id={noticeId} className="mx-4 mt-3 rounded-md bg-page p-3 text-sm text-muted">
        Answers come from LBG onboarding content (demo content). Don&apos;t share personal data. The assistant can make mistakes, so check the linked source.
      </p>

      <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation" className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="text-muted">Ask about pay, holidays, equipment, vetting, your first day and more.</p>
        )}
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              {m.role === "user" && (
                <div className="max-w-[85%] rounded-md bg-brand-tint px-3.5 py-2">
                  <span className="sr-only">You: </span>
                  <span className="whitespace-pre-line break-words">{m.text}</span>
                </div>
              )}
              {m.role === "bot" && (
                <div className="w-full max-w-[95%] rounded-md border border-line bg-card px-3 py-2">
                  <span className="sr-only">Assistant: </span>
                  <p className="whitespace-pre-line break-words">{m.reply.answer}</p>
                  <Citations items={m.reply.citations} onCiteFaq={onCiteFaq} />
                  {m.reply.fallback && (
                    <FallbackCard
                      contact={contact}
                      onSearchFaqs={onSearchFaqs}
                      title={m.reply.citations.length ? "Not sure this answers it?" : "I couldn't find that in our onboarding content."}
                    />
                  )}
                </div>
              )}
              {m.role === "error" && (
                <div className="w-full max-w-[95%] rounded-md border-l-4 border-blocked bg-blocked-tint px-3 py-2">
                  <p className="font-semibold text-blocked">
                    <span aria-hidden="true">! </span>
                    {m.text}
                  </p>
                  <p className="mt-1 text-sm text-ink">You can still search the FAQs or contact P&amp;P.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ContactPnpLink contact={contact} variant="primary" />
                    <button type="button" onClick={onSearchFaqs} className={btnSecondary}>
                      Search FAQs
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {pending && (
          <div className="mt-3 flex items-center gap-2 text-muted">
            <span aria-hidden="true" className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-2 w-2 rounded-full bg-muted motion-safe:animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </span>
            <span role="status">Assistant is replying</span>
          </div>
        )}
        <div ref={logEndRef} />
      </div>

      <form onSubmit={send} className="border-t border-line px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <label htmlFor={inputId} className="block text-sm font-semibold">
          Your question
        </label>
        <div className="mt-1 flex items-end gap-2">
          <textarea
            id={inputId}
            ref={inputRef}
            rows={2}
            value={draft}
            maxLength={MAX_QUESTION_CHARS}
            aria-describedby={countId}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            className={`${controlClass} resize-none`}
          />
          <button type="submit" disabled={pending || !draft.trim()} aria-busy={pending} className={btnPrimary}>
            Send
          </button>
        </div>
        <p id={countId} className={`mt-1 text-sm ${remaining < 50 ? "text-blocked" : "text-muted"}`}>
          {remaining} characters left
        </p>
        <div className="mt-1 flex items-center justify-between gap-2 text-sm">
          <span className="text-muted">Need a person?</span>
          <ContactPnpLink contact={contact} variant="text" />
        </div>
      </form>
    </dialog>
  );
}
