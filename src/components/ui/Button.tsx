import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";
export type ButtonSize = "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 min-h-11 rounded-md font-semibold text-base transition-colors disabled:opacity-60 disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:cursor-not-allowed";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-surface hover:bg-brand-strong active:bg-brand-strong",
  secondary: "bg-surface text-brand border-2 border-brand hover:bg-brand-soft",
  ghost: "text-brand hover:bg-brand-soft",
  danger: "bg-danger text-surface hover:brightness-90",
  accent: "bg-accent text-text hover:brightness-95",
};
const sizes: Record<ButtonSize, string> = {
  md: "px-4",
  lg: "min-h-14 px-6",
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
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & { loading?: boolean };

/** Native button. With `aria-disabled` ("disabled with a visible reason") clicks are ignored but focus is kept. */
export function Button({ variant, size, className, loading, children, onClick, type = "button", ...rest }: ButtonProps) {
  const ariaDisabled = rest["aria-disabled"] === true || rest["aria-disabled"] === "true";
  return (
    <button
      type={type}
      {...rest}
      aria-busy={loading || undefined}
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
