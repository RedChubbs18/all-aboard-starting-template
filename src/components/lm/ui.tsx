"use client";

/**
 * LM helpers: labels, date formatting and thin adapters that keep the LM call sites unchanged
 * while rendering the shared primitives from src/components/ui.
 */
import { AlertTriangle, Check, ChevronRight, Circle, Clock, Cog, Flag, Info, Link2, Lock, MessageCircle, Plus, X, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Owner, Stage, TaskStatus } from "@/domain/types";
import { Alert as SharedAlert } from "@/components/ui/Alert";
import { Badge, OverdueBadge as SharedOverdueBadge, OwnerBadge as SharedOwnerBadge, StatusBadge as SharedStatusBadge } from "@/components/ui/Badge";
import { Button as SharedButton, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar as SharedProgressBar } from "@/components/ui/ProgressBar";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";

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
const ICONS = {
  lock: Lock,
  circle: Circle,
  clock: Clock,
  alert: AlertTriangle,
  check: Check,
  flag: Flag,
  chat: MessageCircle,
  link: Link2,
  plus: Plus,
  chevron: ChevronRight,
  x: X,
  cog: Cog,
  info: Info,
} satisfies Record<string, LucideIcon>;
type IconName = keyof typeof ICONS;

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const Cmp = ICONS[name];
  return <Cmp aria-hidden className={`size-5 shrink-0 ${className}`} strokeWidth={1.8} />;
}

// ----------------------------------------------------------------- buttons
type LmVariant = "primary" | "secondary" | "ghost";

export function Button({
  variant = "primary",
  busy,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: LmVariant; busy?: boolean }) {
  return (
    <SharedButton variant={variant} busy={busy} className={className} {...rest}>
      {children}
    </SharedButton>
  );
}

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <ButtonLink href={href} external variant="secondary" className={className}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </ButtonLink>
  );
}

// ------------------------------------------------------------------ badges
export const StatusBadge = ({ status }: { status: TaskStatus }) => <SharedStatusBadge status={status} />;
export const OverdueBadge = ({ label = "Overdue" }: { label?: string }) => <SharedOverdueBadge label={label} />;
/** Owner pill from the line manager's point of view: LM-owned reads "You". */
export const OwnerBadge = ({ owner }: { owner: string }) => <SharedOwnerBadge owner={owner as Owner} viewerIsLm />;
export const RedFlagBadge = ({ label }: { label: string }) => (
  <Badge tone="danger">
    <Icon name="flag" className="size-3.5" />
    {label}
  </Badge>
);
export const InfoBadge = ({ children }: { children: ReactNode }) => <Badge tone="info">{children}</Badge>;

// ----------------------------------------------------------------- content
export function ProgressBar({ percent, label, overdue }: { percent: number; label: string; overdue?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <SharedProgressBar value={percent} label={label} valueText={label} size="manager" blocked={overdue} className="flex-1" />
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}

export function Alert({
  tone,
  title,
  children,
  role,
  action,
}: {
  tone: "danger" | "warning" | "info" | "success";
  title?: string;
  children?: ReactNode;
  role?: "alert" | "status";
  action?: ReactNode;
}) {
  return (
    <SharedAlert tone={tone} title={title} live={role} action={action}>
      {children}
    </SharedAlert>
  );
}

export { Card, EmptyState, Skeleton, Sheet };
export { ErrorSummary } from "./error-summary";
export { SelectField, TextArea, TextField } from "@/components/ui/Field";
