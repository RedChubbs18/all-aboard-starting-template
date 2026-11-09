import { Check, ChevronDown, Flag, Lock, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

export type StageState = "done" | "current" | "locked";

const icon: Record<StageState, { Icon: LucideIcon; cls: string; word: string }> = {
  done: { Icon: Check, cls: "bg-brand text-surface", word: "Complete" },
  current: { Icon: Flag, cls: "border-[3px] border-brand bg-surface text-brand", word: "Current" },
  locked: { Icon: Lock, cls: "border-2 border-border bg-surface-alt text-text-muted", word: "Locked" },
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

/** Whole row is one 56px+ button (aria-expanded, aria-controls). State is always written in words. */
export function StageHeader({ number, total = 5, label, state, doneCount, totalCount, expanded, controlsId, onToggle, unlockHint, level = 3 }: Props) {
  const { Icon, cls, word } = icon[state];
  const Heading = level === 2 ? "h2" : "h3";
  const summary = `Stage ${number} of ${total}, ${label}. ${word}, ${doneCount} of ${totalCount} tasks done.${
    state === "locked" && unlockHint ? ` ${unlockHint}` : ""
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
        onClick={onToggle}
        className="flex min-h-14 w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-brand-soft"
      >
        <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", cls)}>
          <Icon className="size-5" />
        </span>
        <span aria-hidden className="min-w-0 flex-1">
          <span className="block text-lg font-semibold leading-tight">{label}</span>
          <span className="block text-sm text-text-muted">
            {word}
            {state === "locked" && unlockHint ? `. ${unlockHint}` : ""}
          </span>
        </span>
        <span aria-hidden className="tabular text-sm text-text-muted">
          {doneCount} of {totalCount} done
        </span>
        <ChevronDown aria-hidden className={cn("size-5 shrink-0 text-text-muted motion-safe:transition-transform", expanded && "rotate-180")} />
      </button>
    </Heading>
  );
}
