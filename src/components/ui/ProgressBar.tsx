import { cn } from "./cn";

type Size = "standard" | "thin" | "thick" | "manager";

const SIZE: Record<Size, string> = { standard: "h-2", thin: "h-1.5", thick: "h-3.5", manager: "h-3.5" };

interface Props {
  /** 0..100 */
  value: number;
  label: string;
  /** Spoken value, e.g. "7 of 12 tasks done". */
  valueText?: string;
  /** standard 8px, thin 6px (task rows), thick 14px (overall), manager 14px (LM rows). */
  size?: Size;
  /** Red fill for blocked or overdue. */
  blocked?: boolean;
  className?: string;
}

/** Fill animates with scaleX only (transform), never width. */
export function ProgressBar({ value, label, valueText, size = "standard", blocked, className }: Props) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      aria-valuetext={valueText ?? `${v} percent`}
      className={cn("w-full overflow-hidden rounded-full bg-track", SIZE[size], className)}
    >
      <div
        className={cn(
          "h-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-500",
          blocked ? "bg-blocked" : "bg-brand",
        )}
        style={{ transform: `scaleX(${v / 100})` }}
      />
    </div>
  );
}
