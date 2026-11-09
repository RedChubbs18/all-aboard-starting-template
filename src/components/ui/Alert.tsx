import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "info" | "success" | "warning" | "danger";
const tones: Record<Tone, { cls: string; icon: string; Icon: typeof Info }> = {
  info: { cls: "border-info bg-info-soft", icon: "text-info", Icon: Info },
  success: { cls: "border-success bg-success-soft", icon: "text-success", Icon: CheckCircle2 },
  warning: { cls: "border-warning bg-warning-soft", icon: "text-warning", Icon: AlertTriangle },
  danger: { cls: "border-danger bg-danger-soft", icon: "text-danger", Icon: XCircle },
};

interface Props {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  /** "alert" interrupts; "status" is polite; omit for static content. */
  live?: "alert" | "status";
  className?: string;
}

export function Alert({ tone = "info", title, children, live, className }: Props) {
  const { cls, icon, Icon } = tones[tone];
  return (
    <div role={live} className={cn("flex gap-2 rounded-md border-l-4 p-3 text-text", cls, className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", icon)} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
      </div>
    </div>
  );
}
