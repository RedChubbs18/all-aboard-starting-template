import type { HTMLAttributes } from "react";
import { cn } from "./cn";

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** LM-owned rows in the LM view: brand tint with a green left accent. */
  highlight?: boolean;
  /** The bright green "Next step" feature card (black text on #14a870). */
  feature?: boolean;
  as?: "div" | "section" | "li" | "article";
}

/** White card, 1px line border, 14px radius, no heavy shadow. */
export function Card({ highlight, feature, as: Tag = "div", className, ...rest }: CardProps) {
  return (
    <Tag
      {...rest}
      className={cn(
        "rounded-md border text-ink",
        // Default padding (20px 22px) unless the caller sets its own p-*, px-* or py-*.
        !/(^|\s)p[xy]?-/.test(className ?? "") && "px-[22px] py-5",
        feature
          ? "border-feature bg-feature"
          : highlight
            ? "border-line border-l-4 border-l-brand bg-brand-tint"
            : "border-line bg-card",
        className,
      )}
    />
  );
}
