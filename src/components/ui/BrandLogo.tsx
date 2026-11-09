/* eslint-disable @next/next/no-img-element */
import { BRAND, PLACEHOLDER_LOGO_TEXT } from "@/lib/brand";
import { cn } from "./cn";

/** Logo at a fixed 44px height (STYLE section 16). Official image when enabled, otherwise the "Your bank" placeholder box. */
export function BrandLogo({ className, height = 44 }: { className?: string; height?: number }) {
  const logo = BRAND.logo;
  if (logo) {
    const width = Math.round((logo.width / logo.height) * height);
    return <img src={logo.src} alt={logo.alt} width={width} height={height} style={{ height, width }} className={cn("shrink-0", className)} />;
  }
  return (
    <span
      style={{ height }}
      className={cn("inline-flex shrink-0 items-center rounded-sm bg-brand px-4 text-xl font-bold text-card", className)}
    >
      {PLACEHOLDER_LOGO_TEXT}
    </span>
  );
}
