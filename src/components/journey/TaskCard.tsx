import Link from "next/link";
import { Check, ChevronRight, Info } from "lucide-react";
import type { Owner } from "@/domain/types";
import { OverdueBadge, OwnerBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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

/** The card body is one link (44px+ target) to the task detail; a separate button completes plain tasks. */
export function TaskCard({ task, readOnly, highlightOwner, viewerIsStarter = true, now = new Date(), onComplete, pending }: TaskCardProps) {
  const overdue = task.status !== "DONE" && task.status !== "LOCKED" && isOverdue(task.dueDate, now);
  const highlight = !!highlightOwner && task.owner === highlightOwner;
  const waiting = task.status === "LOCKED" && task.lockedReason;
  const quick = !readOnly && !!onComplete && canQuickComplete(task);
  return (
    <Card as="li" highlight={highlight} className="p-0">
      <Link href={`/journey/task/${task.id}`} className="flex min-h-14 items-center gap-3 rounded-md p-3 hover:bg-brand-soft">
        <span className="min-w-0 flex-1">
          <span className={cn("block font-semibold", task.status === "DONE" && "text-text-muted")}>{task.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={task.status} />
            <OwnerBadge owner={task.owner} viewerIsStarter={viewerIsStarter} />
            {overdue && <OverdueBadge />}
            <span className="text-sm text-text-muted">
              {TYPE_LABEL[task.type]} · {task.status === "DONE" ? "done" : `due ${formatShortDate(task.dueDate)}`}
            </span>
          </span>
          {waiting && (
            <span className="mt-1 flex items-start gap-1 text-sm text-text-muted">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {task.lockedReason}
            </span>
          )}
          {task.status === "BLOCKED" && task.blockedReason && <span className="mt-1 block text-sm text-danger">{task.blockedReason}</span>}
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-text-muted" />
      </Link>
      {quick && (
        <div className="px-3 pb-3">
          <Button variant="secondary" loading={pending} onClick={() => onComplete?.(task)} aria-label={`Mark ${task.title} as done`}>
            <Check aria-hidden className="size-5" />
            Mark done
          </Button>
        </div>
      )}
    </Card>
  );
}
