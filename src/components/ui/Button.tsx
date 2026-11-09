import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * primary: black pill. secondary: ghost (white, 1.5px ink border). ghost: text link (deep green).
 * danger: stuck/alert (white, 2px blocked border). Disabled: sage grey with readable ink (STYLE A.4).
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 min-h-11 rounded-full text-[15px] font-bold leading-tight select-none " +
  "motion-safe:transition-[transform,background-color,opacity] motion-safe:duration-150 active:translate-y-px " +
  "disabled:cursor-default disabled:border-transparent disabled:bg-disabled disabled:text-disabled-ink " +
  "aria-disabled:cursor-default aria-disabled:border-transparent aria-disabled:bg-disabled aria-disabled:text-disabled-ink";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-card hover:bg-dark-green",
  secondary: "border-[1.5px] border-ink bg-card text-ink hover:bg-page",
  ghost: "text-brand-strong font-semibold hover:bg-brand-tint",
  danger: "border-2 border-blocked bg-card text-sm text-blocked hover:bg-blocked-tint",
};

const sizes: Record<ButtonSize, string> = {
  md: "px-5 py-3",
  lg: "min-h-14 px-6 py-3",
  icon: "min-w-11 px-0",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    /** Spinner, disables the button and sets aria-busy. */
    loading?: boolean;
    /** Sets aria-busy only (the action is running but the button stays focusable). */
    busy?: boolean;
  };

/** Native button. With `aria-disabled` ("disabled with a visible reason") clicks are ignored but focus is kept. */
export function Button({ variant, size, className, loading, busy, children, onClick, type = "button", ...rest }: ButtonProps) {
  const ariaDisabled = rest["aria-disabled"] === true || rest["aria-disabled"] === "true";
  return (
    <button
      type={type}
      {...rest}
      aria-busy={loading || busy || undefined}
      disabled={rest.disabled || loading}
      onClick={ariaDisabled ? (e) => e.preventDefault() : onClick}
      className={buttonClass(variant, size, className)}
    >
      {loading && <Loader2 aria-hidden className="size-5 motion-safe:animate-spin" />}
      {children}
    </button>
  );
}

type LinkProps = CommonProps & {
  href: string;
  /** Opens in a new tab with noopener. Use for example.test link-outs and Teams deep links. */
  external?: boolean;
  "aria-label"?: string;
};

/** Link styled as a button. */
export function ButtonLink({ variant, size, className, href, external, children, ...rest }: LinkProps) {
  const cls = buttonClass(variant, size, className);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}
