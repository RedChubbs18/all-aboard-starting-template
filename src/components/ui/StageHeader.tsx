import { Check, ChevronDown, Flag, Lock, type LucideIcon } from "lucide-react";
import { cn } from "./cn";
import { ProgressBar } from "./ProgressBar";

export type StageState = "done" | "current" | "locked";

const icon: Record<StageState, { Icon: LucideIcon; cls: string; word: string }> = {
  done: { Icon: Check, cls: "bg-brand text-card", word: "Complete" },
  current: { Icon: Flag, cls: "border-2 border-now bg-card text-brand-strong shadow-[0_0_0_4px_rgba(0,163,108,0.18)]", word: "Current" },
  locked: { Icon: Lock, cls: "border-2 border-disabled bg-card text-automated", word: "Locked" },
};

interface Props {
  /** 1-based. */
  number: number;
  total?: number;
  label: string;
  state: StageState;
  doneCount: number;
  totalCount: number;
  expanded: boolean;
  controlsId: string;
  onToggle: () => void;
  unlockHint?: string;
  /** Heading level for the wrapper; accordions use 3 under the page h2. */
  level?: 2 | 3;
}

/**
 * Stage card header (STYLE section 13): stage name, thin progress bar and the count on the right.
 * Whole row is one 56px+ button (aria-expanded, aria-controls). State is always written in words.
 * Locked stages show only the name and the reason.
 */
export function StageHeader({ number, total = 5, label, state, doneCount, totalCount, expanded, controlsId, onToggle, unlockHint, level = 3 }: Props) {
  const { Icon, cls, word } = icon[state];
  const Heading = level === 2 ? "h2" : "h3";
  const locked = state === "locked";
  const summary = `Stage ${number} of ${total}, ${label}. ${word}, ${doneCount} of ${totalCount} tasks done.${
    locked && unlockHint ? ` ${unlockHint}` : ""
  }`;
  return (
    <Heading className="m-0">
      <button
        type="button"
        id={`${controlsId}-btn`}
        aria-expanded={expanded}
        aria-controls={controlsId}
        aria-current={state === "current" ? "step" : undefined}
        aria-label={summary}
        aria-disabled={locked || undefined}
        onClick={onToggle}
        className={cn("focus-inset flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left", !locked && "hover:bg-page")}
      >
        <span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", cls)}>
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <span aria-hidden className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold leading-tight">{label}</span>
          {locked ? (
            unlockHint && <span className="mt-0.5 block text-sm text-automated">{unlockHint}</span>
          ) : (
            <span className="mt-1.5 block">
              <ProgressBar value={totalCount ? (doneCount / totalCount) * 100 : 0} label={`${label} progress`} size="thin" />
            </span>
          )}
        </span>
        {!locked && (
          <span aria-hidden className="tabular shrink-0 text-sm font-semibold text-muted">
            {doneCount} of {totalCount}
          </span>
        )}
        {!locked && <ChevronDown aria-hidden className={cn("size-5 shrink-0 text-muted motion-safe:transition-transform", expanded && "rotate-180")} strokeWidth={1.8} />}
      </button>
    </Heading>
  );
}
