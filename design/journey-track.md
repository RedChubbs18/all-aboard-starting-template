# Journey track component spec (FR-1.4)

Assets are PLACEHOLDERS (`design/assets/*.svg`), not the Lloyds black horse. Swap files when official assets arrive; keep the `viewBox` and the component API.

## 1. Layout decision (360px)

**Compact horizontal wavy track as a hero (about 150px tall), with the stage task list as a vertical accordion below it.**

Why: a full vertical winding path pushes tasks off-screen and costs engineering time (long SVG, scroll-linked horse). The horizontal hero keeps horse, stage and forecast visible in one glance and fits the 2s mobile budget (one inline SVG, no images). Five milestones at ~60px spacing fit 360px if labels use `shortLabel`. Full stage names appear in the StageHeader and ARIA text.

```
360px, 16px side padding, hero card (surface, radius-lg, shadow-card)
+------------------------------------------+
| Day 0 stage  -  Step 2 of 5       62%    |  StageHeader + percent (text, 16px/600)
|                                          |
|             (V)           ( )-(F)        |
|   |_______/    \___(C)___/               |  track svg, ~120px; horse sits on path
|  start  Offer Vetting Confirmed Day0 Day30|  shortLabels 12px (HTML, not SVG text)
|                                          |
| [====================-------]  7 of 12   |  ProgressBar (redundant, simple)
+------------------------------------------+
| FORECAST                                 |
| 5 tasks to go  -  Finish about 14 Dec    |
| Next up:                                 |
|  o Upload photo        due Fri 20 Nov    |
|  o Choose device       due Mon 23 Nov    |
|  o Book induction      due Wed 25 Nov    |
+------------------------------------------+
```

Desktop (>=1024px): hero spans the main column at max-width 720px with the track `viewBox` scaled (height 180px); forecast moves to a right column card (320px) beside it. The same component, only the container changes.

## 2. Progress to horse position

- 5 stages in order: `CONDITIONAL_OFFER, PEV, UNCONDITIONAL_OFFER, DAY_0, DAY_30`.
- Track = start line at 0% and 5 milestone flags at 20/40/60/80/100%. Each stage owns a 20% segment ending at its flag (Day 30 flag = finish).
- Per stage fraction `f_s = doneGatingTasks_s / totalGatingTasks_s` (gating tasks only; if none, use all tasks; if zero tasks, f=0 for current/future, 1 for past).
- `progress = (Σ f_s over stages) / 5`, i.e. past stages count 1, future stages 0 (a future stage can never have f>0 because its tasks are LOCKED/TODO unstarted, but compute it, do not assume). Clamp 0..1.
- Display percent = `Math.round(progress*100)`. Never show 100% until the journey status is `completed`; cap at 99 otherwise.
- Horse x/y: put the track path in the DOM, call `path.getPointAtLength(progress * path.getTotalLength())`, translate the horse group to that point (anchor at horse bottom-centre; offset y by -horseHeight*0.9). Rotate by the tangent angle, clamped to +/-12 degrees. Milestones use the same function at k/5 so art and maths cannot drift (do NOT hard-code coordinates from the placeholder SVG; it is only a reference).
- Horse art state: `horse-rest.svg` at progress 0; `horse.svg` while 0<p<1; `horse-celebrate.svg` on completion and for 1.5s on stage completion. Use `currentColor` = `--color-brand`; milestone fills follow section 3.
- Forecast "projected finish": `max(dueDate)` of remaining non-DONE tasks (excluding BLOCKED with no due date); if none remain show "All done". If any remaining task is overdue show the date plus an `overdue` warning text, not just colour.

## 3. Milestone states

| State | Meaning | Visual (11px radius dot, 22px) | Also |
| --- | --- | --- | --- |
| done | stage complete | fill `--color-brand`, white check icon | label text-muted to brand |
| current | stage in progress | white fill, 3px `--color-brand` ring, pulsing halo (disabled for reduced motion) | label bold, `aria-current="step"` |
| locked | stage not yet unlocked | fill `--color-surface-alt`, 2px `--color-border` ring, lock icon | label text-muted |
| finish (Day 30) | final | `--color-accent` fill with dark `--color-brand-strong` flag icon until done; when done brand fill + check | |

Milestone dots are 22px visually but tappable hit area is 44x44 (invisible padding): tap scrolls and expands that stage's task list. Locked stages are still tappable (show "Unlocks when ..." message).

## 4. Forecast area

Content: remaining count ("5 tasks to go"), next 2-3 due tasks (status not DONE, not LOCKED, sorted by dueDate asc, then stage; overdue first with Badge "Overdue"), projected finish date. Each row is a link (44px high) to the task detail. Empty: "You're all caught up" + horse-celebrate small. BLOCKED tasks appear last with blocked reason chip. Loading: skeleton bars (3 rows). Error: inline "Couldn't load your forecast. Retry".

## 5. Animation on task completion

Sequence (total about 1.2s), triggered when `progress` prop increases:
1. 0-100ms: Toast "Task done" (see components.md) and row check morph.
2. 100-900ms: horse translates from old to new point along the path, `ease-in-out`, duration `clamp(500ms, 1200ms*deltaProgress*5, 1200ms)`. Implement with `requestAnimationFrame` interpolating length, or CSS `offset-path`. Horse gallops (swap `horse.svg` and `horse-rest.svg` only if p>0; no frame animation needed).
3. 900-1200ms: percent number counts up (tabular-nums), progress bar fills (transform scaleX, not width).
4. If a milestone is crossed: milestone pops (scale 1 -> 1.25 -> 1, 300ms) and `horse-celebrate.svg` shows 1.5s with 6 star particles (opacity+transform only). Do not use confetti libraries.

Performance: animate only `transform` and `opacity`; one SVG; no layout thrash.

`prefers-reduced-motion: reduce`: no travel, no pop, no particles, no pulse. Horse jumps to the new position instantly (or 150ms opacity cross-fade), number and bar update instantly, the celebrate art swaps for 1.5s statically. The live-region announcement is still made. Implement via `window.matchMedia('(prefers-reduced-motion: reduce)')` in the hook plus CSS `@media` for halo/pulse. Also provide no auto-looping animation at all in the default state.

## 6. Text equivalent and screen readers

The SVG is decorative: `<svg aria-hidden="true" focusable="false">`. The meaningful content is real HTML:

```html
<section aria-labelledby="track-h">
  <h2 id="track-h">Your onboarding journey</h2>

  <!-- Machine-readable summary -->
  <div role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="62"
       aria-valuetext="62 percent complete. Stage 4 of 5: Day 0. 7 of 12 tasks done."
       aria-label="Journey progress"></div>

  <svg aria-hidden="true" focusable="false">...</svg>

  <!-- Text equivalent: ordered list, always in the DOM; visible as the stage accordion headers -->
  <ol aria-label="Journey stages">
    <li><button aria-expanded="false" aria-controls="stage-1">
      Stage 1, Conditional offer. Complete, 6 of 6 tasks done.</button></li>
    <li><button aria-current="step" aria-expanded="true" aria-controls="stage-4">
      Stage 4, Day 0. Current, 2 of 5 tasks done.</button></li>
    <li><button aria-expanded="false" aria-controls="stage-5">
      Stage 5, Day 30. Locked, unlocks when Day 0 tasks are done.</button></li>
  </ol>

  <!-- Forecast as a text block -->
  <div aria-labelledby="fc-h"><h3 id="fc-h">Forecast</h3>
    <p>5 tasks to go. Projected finish 14 December.</p>
    <ul aria-label="Next due tasks"><li><a href="...">Upload photo, due Friday 20 November</a></li> ...</ul></div>

  <!-- Live region: ONE per page, always mounted, visually hidden -->
  <div role="status" aria-live="polite" aria-atomic="true" class="sr-only" id="journey-live"></div>
</section>
```

Rules:
- The status text on milestone/stage state is words ("Complete", "Current", "Locked"), never icon or colour only.
- Live region is mounted at page load (empty), and updated only when `progress` changes after the first render (do not announce on initial load). Debounce 400ms so rapid changes produce one message. Use `polite`, never `assertive`, except journey blocked (see below).
- Example announcements:
  - Task done: "Upload photo marked done. Journey 62 percent complete. 5 tasks to go. Next: Choose device, due Monday 23 November."
  - Stage crossed: "Stage 3, Unconditional offer, complete. You are now on stage 4 of 5, Day 0."
  - All done: "All onboarding tasks complete. Journey 100 percent complete."
  - Blocked/failed vetting: `role="alert"` separate element: "Action needed: your vetting check needs attention. Open Vetting for details."
  - Progress decreased (task reopened): "Journey now 55 percent complete. 6 tasks to go."
- Keyboard: Tab order = progressbar (not focusable) -> stage buttons in order -> forecast links. Milestone dots in the SVG are not focusable; the stage buttons are the controls. Enter/Space toggles. Focus ring per components.md. Focus is not moved on completion.
- Do not use `aria-live` on the progress bar itself.

## 7. Props

```ts
export type StageKey = 'CONDITIONAL_OFFER' | 'PEV' | 'UNCONDITIONAL_OFFER' | 'DAY_0' | 'DAY_30';
export type StageState = 'done' | 'current' | 'locked';

export interface TrackStage {
  key: StageKey;
  label: string;            // "Unconditional offer"
  shortLabel: string;       // "Confirmed" (<= 9 chars, shown under node at 360px)
  state: StageState;
  doneCount: number;        // gating tasks done
  totalCount: number;       // gating tasks total
  unlockHint?: string;      // shown/announced when locked
}

export interface ForecastTask {
  id: string;
  title: string;
  dueDate: string;          // ISO date
  overdue: boolean;
  href: string;
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED';
  owner: 'STARTER' | 'LM' | 'BUDDY' | 'PNP' | 'SYSTEM';
}

export interface JourneyTrackProps {
  stages: TrackStage[];            // exactly 5, in order
  progress: number;                // 0..1, computed by src/domain (single source of truth)
  remainingCount: number;
  nextTasks: ForecastTask[];       // pass up to 3
  projectedFinish: string | null;  // ISO date; null = nothing remaining
  completed: boolean;              // journey.status === 'completed'
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelectStage?: (key: StageKey) => void;   // scroll/expand
  reducedMotion?: boolean;         // override; default reads matchMedia
  variant?: 'full' | 'compact';    // compact: LM list rows (progress bar + percent only, no svg)
  className?: string;
}
```

Domain function the dev should expose: `computeProgress(stages): number` per section 2 with unit tests: 0 tasks, mid stage, past stages, cap 99% until completed.

## 8. Shared with LM (WS2)

`variant="compact"` renders a StageHeader + ProgressBar + overdue count only. The full variant is also used read-only in the LM starter detail (no `onSelectStage` needed).
