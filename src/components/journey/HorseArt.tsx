/**
 * Inline placeholder horse art (copied from design/assets/*.svg; swap when official assets arrive).
 * Rendered as `<g>` in a 120x80 box with the anchor at the hooves, centre. Decorative only.
 */
export type HorseVariant = "rest" | "gallop" | "celebrate";

/** Hoof anchor in art coordinates: bottom-centre. */
export const HORSE_ANCHOR = { x: 60, y: 76 };

export function HorseArt({ variant }: { variant: HorseVariant }) {
  if (variant === "rest") {
    return (
      <g>
        <g fill="currentColor">
          <path d="M30 34c4-8 16-10 30-9 10 1 17 3 22 2l6-9 4 3-4 10c-2 5-8 8-12 9v26h-7V50H46v26h-7V50c-6-2-9-8-9-16z" />
          <path d="M84 27l7-13 6-6 3 4 9 6c3 2 3 6 0 7l-6 2-5 4-6-3z" />
          <path d="M97 8l2-6 3 6z" />
          <path d="M31 33c-8 2-12 10-12 22 6-4 10-5 14-4z" />
        </g>
        <circle cx="99" cy="17" r="1.6" fill="var(--color-surface)" />
      </g>
    );
  }
  if (variant === "celebrate") {
    // Celebrate art is drawn lower in a 120x90 box; shift it so the hooves meet the anchor.
    return (
      <g transform="translate(0 -4)">
        <g fill="currentColor">
          <path d="M38 52c0-10 10-16 22-16s20 6 22 14l6-18 5 2-3 16c-1 6-8 10-12 11l-2 12h-8l1-12H56l-2 12h-8l1-12c-6-2-9-5-9-9z" />
          <path d="M84 30l6-14 7-5 3 4 7 5c2 2 2 5-1 6l-6 2-4 4-6-2z" />
          <path d="M40 50c-8 0-14 4-18 12 7-3 12-2 18 2z" />
        </g>
        <g fill="var(--color-accent)">
          <path d="M18 18l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
          <path d="M62 8l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
          <path d="M108 40l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" />
        </g>
      </g>
    );
  }
  return (
    <g>
      <g fill="currentColor">
        <path d="M30 38c4-8 16-12 30-11 10 1 17 4 24 2l8-9 4 3-5 11c-2 5-9 8-13 9-4 8-8 8-12 8H44c-6 0-12-4-14-13z" />
        <path d="M84 29l8-14 6-6 3 4 9 6c3 2 3 6 0 7l-6 2-5 4-6-3z" />
        <path d="M97 10l2-6 3 6z" />
        <path d="M32 36c-8-2-16 2-22 10 8-2 14-2 21 3z" />
        <path d="M78 52l16 8 14 2-1 5-17-1-17-9z" />
        <path d="M70 55l8 14 9 6-3 4-12-5-9-15z" />
        <path d="M44 54l-12 8-14 8-2-5 13-9 8-9z" />
        <path d="M52 56l-6 15-10 5-2-5 8-4 4-12z" />
      </g>
      <circle cx="99" cy="19" r="1.6" fill="var(--color-surface)" />
    </g>
  );
}
