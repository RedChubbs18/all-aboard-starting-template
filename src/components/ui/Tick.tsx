import { Check } from "lucide-react";
import type { TaskStatus } from "@/domain/types";
import { cn } from "./cn";

/**
 * Status circle (STYLE section 10). Pending: 2px #b8c5bf ring. Done: green fill with white tick.
 * Current: #00a36c ring with a soft 4px glow. Blocked: red fill. Decorative: the status is always also written in words.
 */
export function Tick({ status, current, size = 22, className }: { status: TaskStatus; current?: boolean; size?: number; className?: string }) {
  const done = status === "DONE";
  const blocked = status === "BLOCKED";
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        done && "bg-brand text-card",
        blocked && "bg-blocked text-card",
        !done && !blocked && (current || status === "IN_PROGRESS")
          ? "border-2 border-now bg-card shadow-[0_0_0_4px_rgba(0,163,108,0.18)]"
          : !done && !blocked && "border-2 border-disabled bg-card",
        className,
      )}
    >
      {done && <Check strokeWidth={3} style={{ width: size * 0.6, height: size * 0.6 }} />}
      {blocked && <span className="block rounded-full bg-card" style={{ width: size * 0.3, height: 2 }} />}
    </span>
  );
}
