import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Checkbox with a 44px hit area (STYLE 18, WCAG 2.5.8) around a 24px box. The wrapping label has no text,
 * so give the input its own accessible name (`aria-label`, or a separate <label htmlFor>).
 */
export function Checkbox({ className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className={cn("flex size-11 shrink-0 items-center justify-center", rest.disabled ? "cursor-default" : "cursor-pointer")}>
      <input type="checkbox" {...rest} className={cn("size-6 accent-[var(--color-brand)]", className)} />
    </label>
  );
}
