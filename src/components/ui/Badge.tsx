import { AlertTriangle, Check, Circle, Clock, Cog, Loader, Lock, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Owner, TaskStatus } from "@/domain/types";
import { cn } from "./cn";

const base = "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-sm font-semibold whitespace-nowrap";

export const STATUS_META: Record<TaskStatus, { label: string; cls: string; Icon: LucideIcon }> = {
  LOCKED: { label: "Locked", cls: "bg-surface-alt text-text-muted border border-border", Icon: Lock },
  TODO: { label: "To do", cls: "bg-info-soft text-info", Icon: Circle },
  IN_PROGRESS: { label: "In progress", cls: "bg-brand-soft text-brand", Icon: Loader },
  BLOCKED: { label: "Blocked", cls: "bg-danger-soft text-danger", Icon: AlertTriangle },
  DONE: { label: "Done", cls: "bg-success-soft text-success", Icon: Check },
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const { label, cls, Icon } = STATUS_META[status];
  return (
    <span className={cn(base, cls, className)}>
      <Icon aria-hidden className="size-4" />
      {label}
    </span>
  );
}

export function OverdueBadge({ className }: { className?: string }) {
  return (
    <span className={cn(base, "bg-warning-soft text-warning", className)}>
      <Clock aria-hidden className="size-4" />
      Overdue
    </span>
  );
}

export const OWNER_LABEL: Record<Owner, string> = {
  STARTER: "You",
  LM: "Line manager",
  BUDDY: "Buddy",
  PNP: "P&P",
  SYSTEM: "System",
};

/** `viewerIsStarter=false` renders STARTER as "Starter" (LM and buddy views). */
export function OwnerBadge({ owner, viewerIsStarter = true, className }: { owner: Owner; viewerIsStarter?: boolean; className?: string }) {
  const label = owner === "STARTER" && !viewerIsStarter ? "Starter" : OWNER_LABEL[owner];
  return (
    <span className={cn(base, "border border-border bg-surface text-text", className)}>
      {owner === "SYSTEM" && <Cog aria-hidden className="size-4" />}
      <span className="sr-only">Owner: </span>
      {label}
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
    neutral: "border border-border bg-surface text-text",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
  } as const;
  return <span className={cn(base, tones[tone], className)}>{children}</span>;
}
