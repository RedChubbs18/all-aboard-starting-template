import { AlertTriangle, Check, Circle, Clock, Cog, Loader, Lock, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Owner, TaskStatus } from "@/domain/types";
import { cn } from "./cn";

const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-xs font-bold whitespace-nowrap";

export const STATUS_META: Record<TaskStatus, { label: string; cls: string; Icon: LucideIcon }> = {
  LOCKED: { label: "Locked", cls: "bg-page text-muted border border-line", Icon: Lock },
  TODO: { label: "To do", cls: "bg-mixed-tint text-mixed", Icon: Circle },
  IN_PROGRESS: { label: "In progress", cls: "bg-brand-tint text-brand-strong", Icon: Loader },
  BLOCKED: { label: "Blocked", cls: "bg-blocked-tint text-blocked", Icon: AlertTriangle },
  DONE: { label: "Done", cls: "bg-brand-tint text-brand-strong", Icon: Check },
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const { label, cls, Icon } = STATUS_META[status];
  return (
    <span className={cn(base, cls, className)}>
      <Icon aria-hidden className="size-3.5" strokeWidth={2.2} />
      {label}
    </span>
  );
}

export function OverdueBadge({ className, label = "Overdue" }: { className?: string; label?: string }) {
  return (
    <span className={cn(base, "bg-blocked-tint text-blocked", className)}>
      <Clock aria-hidden className="size-3.5" strokeWidth={2.2} />
      {label}
    </span>
  );
}

/** Four owner kinds (STYLE section 11): You, Your manager, Shared, Automated. */
type OwnerKind = "you" | "manager" | "shared" | "auto" | "other";

const OWNER_STYLE: Record<OwnerKind, string> = {
  you: "bg-brand-tint text-brand-strong",
  manager: "bg-blocked-tint text-blocked",
  shared: "bg-mixed-tint text-mixed",
  auto: "bg-automated-tint text-automated",
  other: "bg-page text-ink border border-line",
};

export const OWNER_LABEL: Record<Owner, string> = {
  STARTER: "You",
  LM: "Your manager",
  BUDDY: "Shared",
  PNP: "Shared",
  SYSTEM: "Automated",
};

/** Who the owner really is, for screen readers and tooltips where the pill says "Shared". */
const OWNER_DETAIL: Partial<Record<Owner, string>> = { BUDDY: "buddy", PNP: "People and Places" };

export function ownerPill(owner: Owner, viewer: "STARTER" | "LM" | "OTHER"): { kind: OwnerKind; label: string } {
  if (viewer === "LM") {
    if (owner === "LM") return { kind: "you", label: "You" };
    if (owner === "STARTER") return { kind: "other", label: "Starter" };
  }
  if (viewer === "OTHER" && owner === "STARTER") return { kind: "other", label: "Starter" };
  if (viewer === "OTHER" && owner === "LM") return { kind: "manager", label: "Line manager" };
  const kind: OwnerKind = owner === "STARTER" ? "you" : owner === "LM" ? "manager" : owner === "SYSTEM" ? "auto" : "shared";
  return { kind, label: OWNER_LABEL[owner] };
}

/**
 * Owner pill. Default is the starter's view. `viewerIsStarter={false}` is the buddy/P&P view
 * (STARTER reads "Starter"); `viewerIsLm` is the line manager's view (LM reads "You").
 */
export function OwnerBadge({
  owner,
  viewerIsStarter = true,
  viewerIsLm = false,
  className,
}: {
  owner: Owner;
  viewerIsStarter?: boolean;
  viewerIsLm?: boolean;
  className?: string;
}) {
  const { kind, label } = ownerPill(owner, viewerIsLm ? "LM" : viewerIsStarter ? "STARTER" : "OTHER");
  const detail = OWNER_DETAIL[owner];
  return (
    <span className={cn(base, OWNER_STYLE[kind], className)}>
      {owner === "SYSTEM" && <Cog aria-hidden className="size-3.5" strokeWidth={2.2} />}
      <span className="sr-only">Owner: </span>
      {label}
      {detail && <span className="sr-only"> ({detail})</span>}
    </span>
  );
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "border border-line bg-card text-ink",
    success: "bg-brand-tint text-brand-strong",
    warning: "bg-blocked-tint text-blocked",
    danger: "bg-blocked-tint text-blocked",
    info: "bg-mixed-tint text-mixed",
  } as const;
  return <span className={cn(base, tones[tone], className)}>{children}</span>;
}
