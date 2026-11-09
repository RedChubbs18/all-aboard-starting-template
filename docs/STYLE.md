# Visual style guide

The team supplied this guide on 2026-11-09. Section A records the accessibility adjustments and scoping decisions made when applying it, and it takes precedence where the two conflict. Section B is the team's guide as supplied.

## A. Adjustments and decisions (apply these first)

Contrast was measured with the WCAG 2.2 formula. The guide's own section 18 requires AA, so the following adjustments keep the look while passing.

1. **Brand green #12a872 is 3.06:1 on white and 2.72:1 on the green tint.** Use it only for large text (at least 24px regular or 18.7px bold), fills, bars, rings and icons, for example the 40px percentage figure. For small green text (the bold green role names on team cards, text links like "Skip for now", the "You" owner pill and accent text below 18.7px bold), use **deep green #0b6e4b** (6.28:1 on white, 5.59:1 on the tint).
2. **Mixed #2f6fb0 on #e5eef8 is 4.46:1, just under AA.** Darken the "Shared" pill text to **#2a64a0** or darker, and verify it reaches at least 4.5:1.
3. **Focus ring #9fd8c0 is 1.61:1 on white,** which fails non-text contrast. Keep the 3px #9fd8c0 ring with a 2px offset, and add a **2px dark-green (#0b3b2b) inner outline** so the indicator reaches at least 3:1. One way: `outline: 2px solid #0b3b2b; outline-offset: 2px; box-shadow: 0 0 0 5px #9fd8c0;`. Apply it consistently to every focusable control.
4. **Disabled controls:** white text on #b8c5bf is 1.78:1. WCAG exempts disabled controls, but for readability use #3d4440 text on the #b8c5bf background. Disabled state must still be conveyed by `disabled` / `aria-disabled`, not by colour alone.
5. **Section 21 overrides earlier sections where they differ.** Page background is #f2f2f2. Cards are white with a 1px #e6e8e6 border and a 14px radius, with no heavy shadow. Selected chip and active nav are #0b3b2b. The feature card (for example "Next step") is the bright green #14a870 with black text and a black pill button with an arrow icon.
6. **Column width:** the 430px phone column applies to starter and buddy screens (journey, team, FAQ, content, goals, photo) and to sign-in. LM, MI and admin screens use the same tokens, cards, chips, buttons and pills, but in a wider container (up to about 1200px) so tables and dashboards stay usable on desktop. They still work at 320–430px.
7. **Bottom navigation** shows the role's main sections. For a starter it is four items: Home (/journey), Team (/team), Checklist (the starter's task list or goals) and Support (/faq). Other roles show their own items. If a role has more than four, keep the four most important in the bar and put the rest in the profile menu. The notification bell becomes the mail icon on the left of the header. The profile icon on the right opens the persona or sign-out menu.
8. **Logo:** no logo file has been supplied. Per section 16, use the brand-green rounded box with white bold text "Your bank" until the team provides one. Don't recreate any bank's logo.
9. **Horse marker:** keep the existing original placeholder horse SVG (`public/brand/`) inside the 40px marker until official artwork is supplied. Same filenames, so it can be swapped in later.
10. **Brand context** (from the agency's public case study, wolffolins.com/work/lloyds). The brand typeface is a customised **GT Ultra**. It's a licensed font, so we don't bundle it. Keep the STYLE.md font stack, with a `--font-brand` token placed first so licensed webfont files can be dropped into `public/fonts/` later. The horse ("Cancara") is a trademark, so **don't recreate it**. Keep our original placeholder until the team supplies the official asset. The brand's motion is drawn from horse movement: let the horse marker move forward with a short, smooth stride-like ease (for example 400–600ms `cubic-bezier(0.22, 1, 0.36, 1)`) when progress increases, and jump instantly under reduced motion. No looping or bouncing. Tone: grounded, plain British English that moves people forward. Keep copy warm, direct and short.
11. **Locked stages: no opacity fade, for contrast; overrides B §13.** A locked stage card is solid `bg-page` with a lock icon, the stage name and the unlock reason in `text-automated` (#3d4440, 8.9:1 on the page grey). Faded text at 55% opacity fell below 4.5:1.
12. **Form control borders #767d79 for 3:1; overrides B §4/§15.** Inputs, selects, textareas, the FAQ search and the demo PIN field use `--color-line-strong` (#767d79, 4.2:1 on white, 3.8:1 on the page). Keep #e6e8e6 (and #c8d1cc) only for decorative card borders and dividers.

## B. Supplied guide

Use this guide to restyle any screens, components or prototype so they match the visual style below. It covers the look only. Do not change the content, layout structure, behaviour or data unless a rule below says otherwise.

The colours and fonts are visual estimates taken from the reference app screens the requester supplied (permission confirmed). Treat the hex values as close matches, not exact brand values.

### 1. Overall feel

Clean, calm and bank-like. The app is white and light grey, with black and one green accent. It uses flat cards, rounded shapes, pill-shaped controls, and bold numbers. It should feel like a modern banking app, not a game. The only playful element is the horse marker on the progress track.

### 2. Colour

| Token | Hex | Use |
|---|---|---|
| Page background | #f4f4f4 | Screen background (see 21: #f2f2f2) |
| Card | #ffffff | Cards, header, bottom navigation, menus |
| Ink | #000000 | Main text, primary buttons, outline colour for chips |
| Muted | #5a5f5c | Secondary text, labels, hints |
| Line | #e1e4e2 | Dividers, card borders, header bottom border |
| Brand green | #12a872 | Progress fill (done), progress figures, accent text, icon rings |
| Green tint | #e4f6ee | Feature card background, avatar background for initials, "You" owner label |
| Deep green | #0b6e4b | Hover or emphasis on green (optional) |
| Dark green | #0d3b2d | Selected chip, active bottom-navigation item, initials button |
| Current task | #00a36c | Ring for the current item |
| Blocked | #c0392b | Blocked or stuck items, red bars, "Stuck?" button |
| Blocked tint | #fbe9e6 | Background of the "Your manager" owner label |
| Mixed | #2f6fb0 | Shared ownership text |
| Mixed tint | #e5eef8 | Background of the "Shared" owner label |
| Automated | #3d4440 on #eceeed | "Automated" owner label |
| Track | #dfe6e2 | Empty part of progress bars |
| Mint | #bffccb | Reserved for announcement banners only |
| Disabled | #b8c5bf | Disabled buttons, empty tick rings |
| Focus ring | #9fd8c0 | 3px outline with 2px offset on any focused control |
| Outer background (desktop) | #e6e8e6 | Area outside the phone-width column |

### 3. Typography

- Font stack: "Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif. One typeface only.
- Body 16px, line height 1.5, Ink. h1 28px bold (margin 0 0 6px). h2 20px bold. Card title h3 17px bold. Secondary text 14px Muted. Labels and tags 12px, bold for owner pills and timing labels.
- Overall percentage 40px, weight 800, letter-spacing -0.02em, brand green. Welcome title 44px bold. Sign-in and photo step titles 30px bold. Header brand text 18px bold, centred.
- Sentence case for all labels and buttons. No all caps.

### 4. Shape, spacing and elevation

- Cards: white, 16px radius (14px acceptable), no shadow or a very faint one (0 1px 2px at 5% black), padding 20px 22px, 14px gap between cards.
- Pill controls (chips, buttons, status pills): 999px radius.
- Inputs and selects: 10px radius, 1px #c8d1cc border, 12px 14px padding, white.
- Page padding: 20px top, 16px sides, 110px bottom (clears the bottom navigation).
- Phone-width column: 430px max, centred, outer background #e6e8e6 on wider screens.
- Spacing steps only: 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 28, 36 px.

### 5. Header

White, sticky, 1px bottom border in Line. One row, three columns: a 44px circle button on the left, centred title, a 44px circle button on the right. Circle buttons have a 1.5px ink border on white with a black outline icon. The left button may instead be a dark green circle with white initials. Padding 12px top, 16px sides.

### 6. Chips (section tabs)

A horizontal row under the header that scrolls sideways on overflow, 8px gap. Each chip: white, 1.5px ink border, ink text, 15px semibold, 8px 18px padding, 999px radius, no wrap. Selected: dark green background and border, white text. Hover: light background or underline, same border.

### 7. Bottom navigation

Fixed to the bottom of the column (max 430px), white, 1px top border in Line. Four equal columns: outline icon (22px, 1.8px stroke, rounded caps and joins) above a 12px label. Inactive muted; active dark green and bold. Padding 8px top, 14px bottom.

### 8. Buttons

- Primary: black, white bold 15px text, 12px 20px padding, 999px radius, no border; full width where the layout calls for it.
- Ghost: white, 1.5px ink border, ink text, same size and radius.
- Text link (e.g. "Skip for now"): no background or border, brand green, semibold 15px, centred.
- Disabled: #b8c5bf background, default cursor.
- Stuck/alert: white, 2px blocked-red border, blocked-red bold 14px text, 6px 12px padding, 999px radius.
- Press state: subtle (e.g. 1px downward shift), quick and small.

### 9. Progress bars and the horse marker

- Standard bar 8px (track #dfe6e2, brand green fill, full radius). Thin bar in task rows 6px. Thick overall bar 14px. Blocked bar fill in blocked red.
- Horse marker: 40px white circle, 2px brand green border, soft shadow (0 2px 6px at 15% black), sitting centred on the thick bar at the overall percentage, horse image about 28px wide.
- Percentages shown as large bold figures above the bar.

### 10. Ticks and status

Tick: 22px circle with a 2px #b8c5bf ring when pending. Done: brand green filled with a white tick. Current: #00a36c ring with a soft 4px glow (rgba(0,163,108,0.18)). Blocked: blocked-red filled. Sub-steps use a 16px version.

### 11. Owner pills

12px bold, 3px 10px padding, 999px radius. You: green tint background, brand green text. Your manager: blocked tint background, blocked-red text. Shared: mixed tint background, mixed text. Automated: light grey background, dark grey text.

### 12. Cards with a green feature

The "Next step" card (or any highlighted call to action) uses the green tint with black text and a black primary button. A bright green card (#12a872) with black text is also acceptable; use one consistently (see 21).

### 13. Tasks, stages and lists

- Stage cards: white, 16px radius, header row with stage name, thin progress bar and count on the right; body separated by a 1px line.
- Task rows: tick on the left, timing label (12px bold muted), title (semibold), reference or note (14px muted), thin progress bar, owner pill on the right; rows separated by 1px lines.
- Sub-steps: indented, 16px tick, text and owner pill, 1px top line each.
- Locked stages: card faded to about 55% opacity, showing only the name and the reason.
- Checklist rows: title and metadata on the left, owner pill on the right, 1px separators.

### 14. Team, FAQ and manager screens

- Team: cards with an 84px circle portrait (green tint background, brand green initials, 26px bold). Name 18px bold, role in bold brand green, a muted line, muted bio. Card grid with 14px gap.
- FAQ: pill-shaped search field. Each question a white card with a bold question and muted answer.
- Manager: a white card with a row per team: team name and count on the left, a 14px bar in the middle, status text on the right. Overdue rows use the blocked-red bar.

### 15. Forms, photo and camera

- Form fields: label 14px semibold; input with 10px radius, 1px border, 12px 14px padding.
- Read-only fields: background-coloured box with 10px radius, 15px text, small muted note below.
- Camera viewfinder: dark (#0d1512) rounded rectangle (14–16px radius), full width, up to 46vh and max 380px tall, with a dashed #9fd8c0 oval guide in the centre.
- Conditions list below the camera: green filled dot for met, empty ring for pending, 1px separators.

### 16. Sign-in, welcome and transitions

- Sign-in card: white, centred, 16px radius, 36px 28px padding, max width 420px.
- Logo at the top of the card or welcome panel, 44px tall, 28px space below. If no logo file is available, use a brand-green rounded box with white bold text "Your bank".
- Panels fade in over about 0.3s; inactive panels hide at once; never overlap or slide half-visible.

### 17. Icons

Outline style, 24×24 grid, 1.8px stroke, rounded caps and joins, no fill. Used: house (Home), two people (Team), rounded rectangle with a tick (Checklist), circle with a question mark (Support), rectangle with a V-shaped flap (mail). No emoji as icons.

### 18. Motion and accessibility

Minimal animation: short fades (0.3s) and the progress fill; no bouncing or looping. Respect reduced motion. Every interactive element shows the 3px #9fd8c0 focus ring with 2px offset. Text contrast at least WCAG AA (check ink on white, muted on white, white on dark green). Touch targets at least 44px.

### 19. Things to avoid

Gradients, glossy effects, heavy shadows, decorative borders; more than one accent colour per screen (apart from status colours); mixing rounded and square corners on one screen; emoji, all-caps labels, decorative symbols in place of icons; any brand logo or trademark other than the supplied file.

### 20. Checklist

- Every screen uses the page background, white cards and the colour tokens.
- Section chips and bottom navigation match, with the selected item in dark green.
- Buttons are black pills; the primary action on each screen is clear.
- Progress bars use brand green for done and red only for blocked.
- Owner pills use the four owner colours.
- Sentence case; progress figures large and bold.
- Layout fits a 320px phone and a 430px column.

### 21. Update from the latest reference screens

These refine the look above; content and layout may change, but the look must match.

- Page background: light neutral grey, close to #f2f2f2.
- Cards: white with a fine 1px border (about #e6e8e6), 14px radius, no heavy shadow.
- Selected section chip: very dark green, close to #0b3b2b, white text. Unselected: white, 1.5px dark outline, dark text.
- Header: centred bold greeting (e.g. "Hi Theresa"), outline icons left (mail) and right (profile), thin dark outline style.
- Bottom navigation: white, outline icons with short labels, active item dark green.
- Primary green feature cards: bright green close to #14a870, black text, black pill button with an arrow icon.
- Amounts and balances: large, bold, dark, pence smaller and bold; positive amounts a deeper green close to #1d7a52.
- Category pill: pale yellow-green close to #c9e8b3 with dark green text, for the selected tab in a two-tab switch.
- Charts: thin bars or sparks in sage green close to #8fc7a9, light axis, small grey labels.
- Lists: rows separated by thin lines, round icon left, bold title, muted sub-line, amount on the right.
- Typography: a clean geometric sans, sentence case.

The hex values are estimates from screenshots; the brand team should confirm exact values.
