import type { HTMLAttributes } from "react";
import { cn } from "./cn";

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** LM-owned rows in the LM view: brand-soft with a left accent. */
  highlight?: boolean;
  as?: "div" | "section" | "li" | "article";
}

export function Card({ highlight, as: Tag = "div", className, ...rest }: CardProps) {
  return (
    <Tag
      {...rest}
      className={cn(
        "rounded-md border bg-surface p-4 shadow-card",
        highlight ? "border-l-4 border-brand border-y-border/40 border-r-border/40 bg-brand-soft" : "border-border/40",
        className,
      )}
    />
  );
}
