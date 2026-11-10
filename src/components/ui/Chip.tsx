import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

const chip =
  "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border-[1.5px] px-[18px] py-2 text-[0.9375rem] font-semibold " +
  "motion-safe:transition-colors";
export const chipClass = chip + " border-ink bg-card text-ink hover:bg-page";
const off = "border-ink bg-card text-ink hover:bg-page";
const on = "border-dark-green bg-dark-green text-card";

/** Horizontally scrolling row of section chips (STYLE section 6). */
export function ChipRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("-mx-4 flex gap-2 overflow-x-auto px-4 pb-1", className)}>
      {children}
    </div>
  );
}

/** Button chip. Use `selected` for toggles/tabs (aria-pressed unless you pass your own role). */
export function Chip({
  selected,
  className,
  children,
  ...rest
}: { selected?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const ariaProps = rest.role === "tab" ? { "aria-selected": !!selected } : { "aria-pressed": !!selected };
  return (
    <button type="button" {...ariaProps} {...rest} className={cn(chip, selected ? on : off, className)}>
      {children}
    </button>
  );
}

/** Link chip for route-based sections (admin tabs); `current` sets aria-current="page". */
export function ChipLink({ href, current, children, className }: { href: string; current?: boolean; children: ReactNode; className?: string }) {
  return (
    <Link href={href} aria-current={current ? "page" : undefined} className={cn(chip, current ? on : off, className)}>
      {children}
    </Link>
  );
}
