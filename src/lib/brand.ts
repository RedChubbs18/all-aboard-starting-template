/**
 * Brand asset paths. Official files live in public/brand/official/ (git-ignored, not in the repo).
 * Set NEXT_PUBLIC_BRAND_ASSETS=official in .env to use them; otherwise the placeholders are used:
 * a brand-green "Your bank" box for the logo and the original placeholder horse.
 * Every consumer renders with fixed width/height so a missing official file cannot break layout.
 */
const official = process.env.NEXT_PUBLIC_BRAND_ASSETS === "official";

export const BRAND = {
  official,
  /** null means "draw the placeholder box" (see BrandLogo). */
  logo: official ? { src: "/brand/official/logo.svg", width: 158, height: 43, alt: "Lloyds" } : null,
  horse: official
    ? { src: "/brand/official/horse-mark.svg", width: 46, height: 43 }
    : { src: "/brand/horse.svg", width: 120, height: 80 },
  favicon: official ? "/brand/official/favicon.ico" : "/favicon.ico",
} as const;

export const PLACEHOLDER_LOGO_TEXT = "Your bank";
