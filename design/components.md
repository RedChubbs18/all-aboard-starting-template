# Shared primitives (`src/components/ui/`)

Tokens come from `design/tokens.css` (copy/import into `globals.css`). Two ways to use them in Tailwind:
1. Arbitrary values (works with no config): `bg-[var(--color-brand)]`, `text-[var(--color-text-muted)]`, `rounded-[var(--radius-md)]`, `shadow-[var(--shadow-card)]`, `font-[family-name:var(--font-sans)]`.
2. Theme names (recommended, one-time config; `tailwind.config` `theme.extend.colors`): `brand: 'var(--color-brand)'`, `brand-strong`, `brand-soft`, `accent`, `surface`, `surface-alt`, `border` -> `line` is safer to avoid clashing with border utilities, `text` -> `ink`, `ink-muted`, `success`, `warning`, `danger`, `info`; `borderRadius: { sm, md, lg }` from the radius vars; `boxShadow.card`; `fontFamily.sans`. Examples below use theme names; swap for the arbitrary form if not configured: `bg-brand` = `bg-[var(--color-brand)]`, `text-ink` = `text-[var(--color-text)]`, `border-line` = `border-[var(--color-border)]`.

Global rules
- Min touch target 44x44px for anything tappable (`min-h-11 min-w-11`). Spacing between adjacent targets >= 8px.
- Focus ring (all interactive, `:focus-visible` only): `focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-info focus-visible:ring-offset-2 focus-visible:ring-offset-surface`. On dark backgrounds (header, primary button) use `ring-accent ring-offset-brand-strong`. Ring colours both exceed 3:1 against adjacent colours (info on white 6.67; accent on brand-strong 6.78).
- Body text 16px min, line-height 1.5. Never accent colour as text. Never colour-only status: always icon + text.
- Status tints (not tokens; contrast verified in `design/scripts/contrast.mjs`): success `#e2f3e8`, warning `#fdf1d8`, danger `#fbe6e4`, info `#e4effb`. Use as `bg-[#e2f3e8]` etc, with the status colour as text (5.46-5.73:1) or `text-ink`.
- Motion: wrap transitions in `motion-safe:`; keep to `transition-colors`, `transform`, `opacity`, 150-200ms.
- Icons: lucide-react, 20px, `aria-hidden` when next to text.

## Button
Base: `inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-md font-semibold text-base transition-colors disabled:opacity-60 disabled:cursor-not-allowed` + focus ring.
| Variant | Classes |
| --- | --- |
| primary | `bg-brand text-surface hover:bg-brand-strong active:bg-brand-strong` |
| secondary | `bg-surface text-brand border-2 border-brand hover:bg-brand-soft` |
| ghost | `text-brand hover:bg-brand-soft` |
| danger | `bg-danger text-surface hover:brightness-90` |
| accent (rare, one per screen, e.g. celebrate CTA) | `bg-accent text-ink hover:brightness-95` |
Sizes: `md` min-h-11 (default), `lg` min-h-14 (sticky action bars), `icon` 44x44. Loading: spinner + `aria-busy`, label stays. Disabled-with-reason uses `aria-disabled` + visible helper text.

## Card
`bg-surface rounded-md border border-line/40 shadow-card p-4` (use `border-line` full-strength when the card is interactive or sits on `surface`; decorative card borders may be lighter, but inputs must use full `border-line`). Interactive card = a single `<a>` / `<button>` wrapping content, `hover:bg-brand-soft`, chevron icon right. Highlight variant (LM-owned tasks): `bg-brand-soft border-l-4 border-brand`.

## Badges (icon + text, `inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-sm font-semibold`)
Task status:
| Status | Classes | Icon | Label |
| --- | --- | --- | --- |
| LOCKED | `bg-surface-alt text-ink-muted border border-line` | Lock | Locked |
| TODO | `bg-[#e4effb] text-info` | Circle | To do |
| IN_PROGRESS | `bg-brand-soft text-brand` | Loader/Clock | In progress |
| BLOCKED | `bg-[#fbe6e4] text-danger` | AlertTriangle | Blocked |
| DONE | `bg-[#e2f3e8] text-success` | Check | Done |
Overdue (extra): `bg-[#fdf1d8] text-warning` + Clock, label "Overdue".
Owner (outlined, neutral so status stays the loudest signal): `bg-surface text-ink border border-line`, with label "You" (STARTER), "Line manager" (LM), "Buddy", "P&P", "System" (SYSTEM, Cog icon). LM-owned tasks in LM view also get the Card highlight.

## ProgressBar
Track `h-2 rounded-full bg-surface-alt border border-line/50`; fill `bg-brand` with `origin-left` and animate `scaleX` only. `role="progressbar"` with `aria-valuenow/min/max` and `aria-valuetext`. Text label ("7 of 12") always adjacent. Fill >= 3:1 against track (brand vs surface-alt 7.93).

## ContactCard
Card + 56px avatar (img with alt = name, or initials: `bg-brand-soft text-brand-strong font-semibold`), name (h3), role line `text-ink-muted`, optional bio (`line-clamp-3`, "Read more" toggle), two Buttons side by side `[Chat on Teams] [Call]` (secondary, min-h-11, flex-1). Missing bio: muted fallback line. Missing UPN: buttons disabled with text "Teams link unavailable". Props: `{ name, role, upn?, photoUrl?, bio?, variant?: 'full'|'compact' }`.

## StageHeader
`flex items-center gap-3`: stage icon in 40px circle (state colours from the milestone table in journey-track.md), `h2 text-lg font-semibold` stage name, right-aligned "2 of 5 done" `text-ink-muted text-sm`, expander chevron. Whole row is a `<button aria-expanded aria-controls>`; min-h-14. Locked: lock icon + unlock hint under the title.

## BottomNav
`fixed bottom-0 inset-x-0 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)] h-16 grid grid-cols-4`, `<nav aria-label="Main">`. Item: `flex flex-col items-center justify-center min-h-11 text-xs`; active `text-brand font-semibold` with a 3px `bg-brand` top indicator and `aria-current="page"`; inactive `text-ink-muted`. Hide at `lg:` (replace with top tabs). Add `pb-20` to page content to avoid overlap.

## Sheet / Dialog
Use Radix Dialog (or native `<dialog>`) for focus trap, Esc and focus return. Overlay `bg-ink/50`. Sheet (mobile): `fixed inset-x-0 bottom-0 max-h-[90dvh] rounded-t-lg bg-surface shadow-card p-4 overflow-y-auto` with a 4px grab handle (decorative) and a visible 44px Close button; slide-up 200ms under `motion-safe`. Dialog (confirm): centred `max-w-sm rounded-lg p-6`; destructive/confirm buttons at bottom, cancel first in DOM order for destructive actions. Desktop `lg:`: Sheet becomes right drawer `lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[420px] lg:rounded-none lg:rounded-l-lg`. Always has `aria-labelledby` title.

## EmptyState
Centered `py-10 px-4 text-center`: 96px placeholder illustration (`horse-rest.svg` in `text-brand/80`, `aria-hidden`), `h2 text-lg font-semibold`, one sentence `text-ink-muted`, optional primary/secondary Button. Always say what happens next or what to do.

## Toast
Region `fixed top-3 inset-x-3 lg:top-auto lg:bottom-4 lg:right-4 lg:left-auto lg:w-96 z-50`, `role="status"` (polite) for success/info, `role="alert"` for errors. Toast: `bg-brand-strong text-surface rounded-md shadow-card p-3 flex gap-2` (error: `bg-danger`), icon + text + 44px dismiss button; auto-dismiss 5s for success only (pause on hover/focus); errors persist until dismissed (WCAG 2.2.1). Reduced motion: fade only.

## Also needed (small)
- Alert: `rounded-md border-l-4 p-3 flex gap-2` using tint bg + status text, icon + title + body.
- Input: `min-h-12 w-full rounded-md border-2 border-line bg-surface px-3 text-base focus-visible:border-info` + visible `<label>`, error text `text-danger` with icon and `aria-describedby`.
- Skeleton: `animate-pulse motion-reduce:animate-none bg-surface-alt rounded-md`.
- Page background `bg-surface-alt text-ink font-sans`; `<a>` links `text-brand underline underline-offset-2`.
