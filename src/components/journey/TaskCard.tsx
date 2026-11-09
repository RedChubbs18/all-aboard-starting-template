import Link from "next/link";
import { useRef } from "react";
import { Check, Info } from "lucide-react";
import type { Owner } from "@/domain/types";
import { OwnerBadge, STATUS_META } from "@/components/ui/Badge";
import { Tick } from "@/components/ui/Tick";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { formatShortDate, isOverdue } from "./format";
import { canQuickComplete } from "./task-rules";
import type { TaskDto } from "./types";

export interface TaskCardProps {
  task: TaskDto;
  /** Viewer cannot act on this journey (LM/buddy/P&P looking at someone else's). Hides action buttons. */
  readOnly?: boolean;
  /** Highlight tasks owned by this role (LM view: "LM"). */
  highlightOwner?: Owner;
  viewerIsStarter?: boolean;
  now?: Date;
  /** One-tap completion for plain tasks. Omit to hide the button. */
  onComplete?: (task: TaskDto) => void;
  pending?: boolean;
}

const TYPE_LABEL: Record<TaskDto["type"], string> = {
  INFO: "Read",
  ACTION: "Action",
  BOOKING: "Booking",
  ORDER: "Order",
  INTEGRATION_STATUS: "Status",
  TRAINING: "Training",
  VIDEO: "Video",
  CHECKLIST: "Checklist",
};

/** Task row (STYLE section 13): tick left, timing label, title, note, owner pill right. The row is one link (44px+ target); a separate button completes plain tasks. */
export function TaskCard({ task, readOnly, highlightOwner, viewerIsStarter = true, now = new Date(), onComplete, pending }: TaskCardProps) {
  const rowRef = useRef<HTMLAnchorElement>(null);
  const overdue = task.status !== "DONE" && task.status !== "LOCKED" && isOverdue(task.dueDate, now);
  const highlight = !!highlightOwner && task.owner === highlightOwner;
  const waiting = task.status === "LOCKED" && task.lockedReason;
  const quick = !readOnly && !!onComplete && canQuickComplete(task);
  // D20: SYSTEM steps are a compact read-only status row for the starter.
  const compact = viewerIsStarter && task.owner === "SYSTEM";
  const timing = task.status === "DONE" ? "Done" : overdue ? `Overdue, due ${formatShortDate(task.dueDate)}` : `Due ${formatShortDate(task.dueDate)}`;
  if (compact) {
    return (
      <li className="border-t border-line bg-page/60 first:border-t-0">
        <Link href={`/journey/task/${task.id}`} className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm hover:bg-page focus-inset">
          <Tick status={task.status} className="size-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className={cn("block font-semibold", task.status === "DONE" && "text-muted")}>{task.title}</span>
            <span className="block text-xs text-muted">
              <span className="sr-only">Status: </span>
              {STATUS_META[task.status].label} · Automatic step
            </span>
          </span>
        </Link>
      </li>
    );
  }
  return (
    <li className={cn("border-t border-line first:border-t-0", highlight && "border-l-4 border-l-brand bg-brand-tint")}>
      <Link ref={rowRef} href={`/journey/task/${task.id}`} className="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-page focus-inset">
        <Tick status={task.status} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className={cn("block text-xs font-bold", overdue ? "text-blocked" : "text-muted")}>
            <span className="sr-only">Status: {STATUS_META[task.status].label}. </span>
            {timing} · {TYPE_LABEL[task.type]}
            {task.optional && <span className="ml-1.5 rounded-full border border-line bg-page px-2 py-px font-bold text-ink">Optional</span>}
          </span>
          <span className={cn("block font-semibold", task.status === "DONE" && "text-muted")}>{task.title}</span>
          {waiting && (
            <span className="mt-0.5 flex items-start gap-1 text-sm text-muted">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
              {task.lockedReason}
            </span>
          )}
          {task.status === "BLOCKED" && task.blockedReason && <span className="mt-0.5 block text-sm text-blocked">{task.blockedReason}</span>}
        </span>
        <OwnerBadge owner={task.owner} viewerIsStarter={viewerIsStarter} viewerIsLm={highlightOwner === "LM"} className="mt-0.5 shrink-0" />
      </Link>
      {quick && (
        <div className="px-4 pb-3 pl-[50px]">
          <Button variant="secondary" loading={pending} 
            onClick={() => {
              // The button unmounts once the task is DONE, so move focus to the row first (WCAG 2.4.3).
              rowRef.current?.focus();
              onComplete?.(task);
            }}
            aria-label={`Mark done: ${task.title}`}
          >
            <Check aria-hidden className="size-5" strokeWidth={1.8} />
            Mark done
          </Button>
        </div>
      )}
    </li>
  );
}
