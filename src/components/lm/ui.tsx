"use client";

/**
 * LM-local UI primitives, styled with the design tokens only (design/components.md).
 * Deliberately local to src/components/lm so WS1's shared primitives can replace them at integration.
 */
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Stage, TaskStatus } from "@/domain/types";

// ------------------------------------------------------------------ labels

export const STAGE_LABEL: Record<Stage, string> = {
  CONDITIONAL_OFFER: "Conditional offer",
  PEV: "Vetting",
  UNCONDITIONAL_OFFER: "Unconditional offer",
  DAY_0: "Day 0",
  DAY_30: "Day 30",
};

/** What each stage means (D10). */
export const STAGE_HINT: Record<Stage, string> = {
  CONDITIONAL_OFFER: "The colleague has accepted the offer.",
  PEV: "First Advantage vetting is in progress.",
  UNCONDITIONAL_OFFER: "Vetting is complete and the offer conditions are met.",
  DAY_0: "The first day.",
  DAY_30: "Day 30 onwards.",
};

export const OWNER_LABEL: Record<string, string> = {
  STARTER: "Starter",
  LM: "You (line manager)",
  BUDDY: "Buddy",
  PNP: "P&P",
  SYSTEM: "System",
};

const dateFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Calendar dates (start and due dates) are stored as UTC midnight/noon, so format in UTC. */
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

/** `<input type="datetime-local">` value (local time) to an ISO string, or "" if empty/invalid. */
export const localToIso = (v: string) => {
  const d = new Date(v);
  return v && !Number.isNaN(d.getTime()) ? d.toISOString() : "";
};

// ------------------------------------------------------------------- icons

type IconName = "lock" | "circle" | "clock" | "alert" | "check" | "flag" | "chat" | "link" | "plus" | "chevron" | "x" | "cog" | "info";
const PATHS: Record<IconName, ReactNode> = {
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  circle: <circle cx="12" cy="12" r="8" />,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  alert: <><path d="M12 4 3 20h18L12 4Z" /><path d="M12 10v4M12 17h.01" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  flag: <path d="M6 21V4h11l-2 4 2 4H6" />,
  chat: <path d="M4 5h16v11H9l-5 4V5Z" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  cog: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
};

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      {PATHS[name]}
    </svg>
  );
}

// ----------------------------------------------------------------- buttons

const BTN =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-info focus-visible:ring-offset-2";
const VARIANT = {
  primary: "bg-brand text-surface hover:bg-brand-strong",
  secondary: "border-2 border-brand bg-surface text-brand hover:bg-brand-soft",
  ghost: "text-brand hover:bg-brand-soft",
} as const;

export function Button({
  variant = "primary",
  busy,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT; busy?: boolean }) {
  return (
    <button type="button" {...rest} aria-busy={busy || undefined} className={`${BTN} ${VARIANT[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function ExternalLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${BTN} ${VARIANT.secondary} ${className}`}
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

// ------------------------------------------------------------------ badges

const BADGE = "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-sm font-semibold";

const STATUS: Record<TaskStatus, { cls: string; icon: IconName; label: string }> = {
  LOCKED: { cls: "border border-border bg-surface-alt text-text-muted", icon: "lock", label: "Locked" },
  TODO: { cls: "bg-[#e4effb] text-info", icon: "circle", label: "To do" },
  IN_PROGRESS: { cls: "bg-brand-soft text-brand", icon: "clock", label: "In progress" },
  BLOCKED: { cls: "bg-[#fbe6e4] text-danger", icon: "alert", label: "Blocked" },
  DONE: { cls: "bg-[#e2f3e8] text-success", icon: "check", label: "Done" },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const s = STATUS[status];
  return (
    <span className={`${BADGE} ${s.cls}`}>
      <Icon name={s.icon} className="size-4" />
      {s.label}
    </span>
  );
}

export const OverdueBadge = ({ label = "Overdue" }: { label?: string }) => (
  <span className={`${BADGE} bg-[#fdf1d8] text-warning`}>
    <Icon name="clock" className="size-4" />
    {label}
  </span>
);

export const OwnerBadge = ({ owner }: { owner: string }) => (
  <span className={`${BADGE} border border-border bg-surface text-text`}>
    {owner === "SYSTEM" && <Icon name="cog" className="size-4" />}
    {OWNER_LABEL[owner] ?? owner}
  </span>
);

export const RedFlagBadge = ({ label }: { label: string }) => (
  <span className={`${BADGE} bg-[#fbe6e4] text-danger`}>
    <Icon name="flag" className="size-4" />
    {label}
  </span>
);

export const InfoBadge = ({ children }: { children: ReactNode }) => (
  <span className={`${BADGE} bg-[#e4effb] text-info`}>{children}</span>
);

// ----------------------------------------------------------------- content

export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={label}
        className="h-2 flex-1 overflow-hidden rounded-full border border-border/50 bg-surface-alt"
      >
        <div className="h-full origin-left bg-brand motion-safe:transition-transform" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}

const ALERT = {
  danger: { cls: "border-danger bg-[#fbe6e4] text-danger", icon: "alert" as const },
  warning: { cls: "border-warning bg-[#fdf1d8] text-warning", icon: "alert" as const },
  info: { cls: "border-info bg-[#e4effb] text-info", icon: "info" as const },
  success: { cls: "border-success bg-[#e2f3e8] text-success", icon: "check" as const },
};

export function Alert({
  tone,
  title,
  children,
  role,
  action,
}: {
  tone: keyof typeof ALERT;
  title?: string;
  children?: ReactNode;
  role?: "alert" | "status";
  action?: ReactNode;
}) {
  const a = ALERT[tone];
  return (
    <div role={role} className={`flex gap-2 rounded-md border-l-4 p-3 ${a.cls}`}>
      <Icon name={a.icon} className="mt-0.5" />
      <div className="flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-text">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

export const Skeleton = ({ className = "h-20" }: { className?: string }) => (
  <div aria-hidden="true" className={`animate-pulse rounded-md bg-surface-alt motion-reduce:animate-none ${className}`} />
);

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-md bg-surface px-4 py-10 text-center shadow-card">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <p className="mt-1 text-text-muted">{children}</p>}
    </div>
  );
}

export function Card({ children, className = "", highlight = false }: { children: ReactNode; className?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md p-4 shadow-card ${highlight ? "border-l-4 border-brand bg-brand-soft" : "border border-border/40 bg-surface"} ${className}`}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------- forms

const INPUT =
  "min-h-12 w-full rounded-md border-2 border-border bg-surface px-3 text-base focus-visible:border-info focus-visible:outline-none aria-[invalid=true]:border-danger";

interface FieldShell {
  label: string;
  error?: string;
  hint?: string;
}

function Shell({ label, error, hint, htmlFor, errId, hintId, children }: FieldShell & { htmlFor: string; errId: string; hintId: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block font-semibold">
        {label}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="mt-1 text-sm text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="mt-1 flex items-center gap-1 text-sm font-semibold text-danger">
          <Icon name="alert" className="size-4" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

const describe = (error: string | undefined, hint: string | undefined, errId: string, hintId: string) =>
  [error ? errId : "", hint ? hintId : ""].filter(Boolean).join(" ") || undefined;

export function TextField({
  label, error, hint, className, ...rest
}: FieldShell & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id">) {
  const id = useId();
  return (
    <Shell label={label} error={error} hint={hint} htmlFor={id} errId={`${id}-e`} hintId={`${id}-h`}>
      <input id={id} {...rest} aria-invalid={!!error} aria-describedby={describe(error, hint, `${id}-e`, `${id}-h`)} className={`${INPUT} ${className ?? ""}`} />
    </Shell>
  );
}

export function TextArea({
  label, error, hint, ...rest
}: FieldShell & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id">) {
  const id = useId();
  return (
    <Shell label={label} error={error} hint={hint} htmlFor={id} errId={`${id}-e`} hintId={`${id}-h`}>
      <textarea id={id} rows={3} {...rest} aria-invalid={!!error} aria-describedby={describe(error, hint, `${id}-e`, `${id}-h`)} className={`${INPUT} py-2`} />
    </Shell>
  );
}

export function SelectField({
  label, error, hint, children, ...rest
}: FieldShell & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id">) {
  const id = useId();
  return (
    <Shell label={label} error={error} hint={hint} htmlFor={id} errId={`${id}-e`} hintId={`${id}-h`}>
      <select id={id} {...rest} aria-invalid={!!error} aria-describedby={describe(error, hint, `${id}-e`, `${id}-h`)} className={INPUT}>
        {children}
      </select>
    </Shell>
  );
}

/** Summary shown above a form after a failed submit; focus moves to it so screen readers announce it. */
export function ErrorSummary({ message }: { message: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);
  if (!message) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="rounded-md focus-visible:outline-none">
      <Alert tone="danger" title="Please fix the highlighted fields">
        {message}
      </Alert>
    </div>
  );
}

// ------------------------------------------------------------------- sheet

/** Bottom sheet on mobile, right-hand drawer on desktop. Native <dialog>: focus trap, Esc, focus return. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-lg bg-surface p-4 text-text shadow-card backdrop:bg-text/50 lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:max-h-none lg:w-[480px] lg:rounded-none"
    >
      {open && (
        <>
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 id={titleId} className="text-xl font-semibold text-brand-strong">
              {title}
            </h2>
            <Button variant="ghost" onClick={onClose} aria-label="Close" className="min-w-11 px-2">
              <Icon name="x" />
            </Button>
          </div>
          {children}
        </>
      )}
    </dialog>
  );
}

// ------------------------------------------------------------------- toast

export interface ToastMsg {
  id: number;
  tone: "success" | "error";
  text: string;
}

/** Success toasts auto-dismiss after 5s; errors persist until dismissed (WCAG 2.2.1). */
export function ToastRegion({ toasts, dismiss }: { toasts: ToastMsg[]; dismiss: (id: number) => void }) {
  useEffect(() => {
    const timers = toasts.filter((t) => t.tone === "success").map((t) => setTimeout(() => dismiss(t.id), 5000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);
  return (
    <div className="fixed inset-x-3 top-3 z-50 flex flex-col gap-2 lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-auto lg:w-96">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={`flex items-center gap-2 rounded-md p-3 text-surface shadow-card ${t.tone === "error" ? "bg-danger" : "bg-brand-strong"}`}
        >
          <Icon name={t.tone === "error" ? "alert" : "check"} />
          <span className="flex-1">{t.text}</span>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss message" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-surface/20">
            <Icon name="x" />
          </button>
        </div>
      ))}
    </div>
  );
}
