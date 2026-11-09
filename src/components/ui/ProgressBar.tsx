import { cn } from "./cn";

interface Props {
  /** 0..100 */
  value: number;
  label: string;
  /** Spoken value, e.g. "7 of 12 tasks done". */
  valueText?: string;
  className?: string;
}

/** Fill animates with scaleX only (transform), never width. */
export function ProgressBar({ value, label, valueText, className }: Props) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      aria-valuetext={valueText ?? `${v} percent`}
      className={cn("h-2 w-full overflow-hidden rounded-full border border-border/50 bg-surface-alt", className)}
    >
      <div
        className="h-full origin-left bg-brand motion-safe:transition-transform motion-safe:duration-500"
        style={{ transform: `scaleX(${v / 100})` }}
      />
    </div>
  );
}
