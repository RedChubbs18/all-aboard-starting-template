import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "info" | "success" | "warning" | "danger";

const tones: Record<Tone, { cls: string; icon: string; Icon: typeof Info }> = {
  info: { cls: "border-mixed bg-mixed-tint", icon: "text-mixed", Icon: Info },
  success: { cls: "border-brand-strong bg-brand-tint", icon: "text-brand-strong", Icon: CheckCircle2 },
  warning: { cls: "border-blocked bg-blocked-tint", icon: "text-blocked", Icon: AlertTriangle },
  danger: { cls: "border-blocked bg-blocked-tint", icon: "text-blocked", Icon: XCircle },
};

interface Props {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  /** Optional action row (button or link) under the message. */
  action?: ReactNode;
  /** "alert" interrupts; "status" is polite; omit for static content. */
  live?: "alert" | "status";
  className?: string;
}

export function Alert({ tone = "info", title, children, action, live, className }: Props) {
  const { cls, icon, Icon } = tones[tone];
  return (
    <div role={live} className={cn("flex gap-2 rounded-md border-l-4 p-3 text-ink", cls, className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", icon)} strokeWidth={1.8} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
