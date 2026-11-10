# MyJourney: round 2 review (10 November 2026, demo day)

This review draws on three independent reviews (product/demo, code and WCAG 2.2 AA) of everything built from the team's round-2 answers (D26–D37).

## 1. Status

- **D27, D29–D32, D36:** done end to end. The job-family laptops, completion prompts, stage timing, PEV status rules and MI rework all work against the real templates.
- **D33–D35:** the LBG palette, responsive layout and accessibility preferences are built and verified by tests. **Nobody has looked at them in a browser yet.**
- **D28 photo:** on-device live checks gate the capture button, and Claude checks the photo after capture. If the device can't run live checks, capture is still allowed and the server check decides.
- **D26 guest identity:** works once a real invite links the guest's object ID. A *simulated* invite creates a starter who can't sign in.
- **Fixed today:**
  - Accessibility round 2, all 14 items. The camera screen was unreadable in dark themes and the face guide invisible in light themes. Large-text overlaps, the profile menu at 320px, keyboard access to wide tables and some fixed-pixel text were also fixed.
  - Code round 2, in progress (§5).

## 2. Questions for the team (with recommended defaults)

1. **Real Gmail invite on stage?** It's on. It needs `User.Invite.All` consent and the tenant's Gmail guest settings (Google federation or email one-time passcode). *Default:* rehearse one real invite now. Go real only if the chain completes twice; otherwise switch back to simulated.
2. **Where does the candidate redeem the invite?** The email's link and redirect point at `http://localhost:3000`, which a phone can't open. *Default:* redeem on the laptop. Or set up a tunnel (see `docs/MOBILE-APP.md`) and put its URL in `NEXT_PUBLIC_MYJOURNEY_PUBLIC_URL` plus the Entra redirect URIs.
3. **Which starter signs in on stage?** The seeded personas (Alex and others) are **member accounts, not guests**. *Default:* the Workday-created guest for the opening (if the real invite works), then Alex for later stages. Say aloud that Alex is a test member account.
4. **Photo beats:** the live check will probably block a sunglasses photo *before* capture, which shows the on-device layer working. To show the AI rejecting one, upload a saved sunglasses photo. *Default:* live camera for the clear photo, upload for the rejection.
5. **Fallback if Entra fails:** demo mode is refused in production builds unless `ALLOW_DEMO_MODE=1` is set. *Default:* present from `npm run dev`. If you use `npm start`, set `ALLOW_DEMO_MODE=1` and `DEMO_PIN` and test the fallback once.
6. **"Jump to Day 0":** present it as an openly labelled fast-forward, after the photo step.
7. **Teams links:** these only work for people imported into Entra and mapped. *Default:* import CSVs 2 and 3, then re-run the mapping. Until then, avoid Sam's and Nadia's manager and buddy links.
8. **Survey:** if you have fewer than 15 responses, say "baseline to be measured" rather than quoting percentages.
9. **Feature tile colour:** the code uses the LBG accent `#0be248` for the "Next step" card; STYLE.md says `#11b67a`. *Default:* keep the code and update the doc.

## 3. Walkthrough inventory (raw material for your script)

**Mock Workday (http://localhost:3001)**
- **Recruiter (`/recruiter`, any signed-in tenant member):** create an offer with job family, team (use **Digital Workplace Engineering**: LM Dana, buddy Kai), LM, start date (a random Monday) and conditions. You get a big link and QR code. Keep the tab open: it sends invites automatically and shows a status timeline and activity log. There's also a "Reset demo data" button.
- **Candidate (`/offer/<token>`, no sign-in):** offer letter with device entitlement → enter details and personal email → accept → "Check your email…".

**Starter (http://localhost:3000)**
- **Journey:** horse track and progress %, Next step card, forecast, stages with descriptions, vetting status at the top of PEV (no status until invited), and the failed-vetting warning page.
- **Tasks:** reading tasks complete when opened. Action tasks ask "Is this task complete?". Marking a task done moves you to the next one.
- **Device:** entitled models only (Engineering: MacBook Pro M5 Pro or EliteBook U7), plus optional peripherals.
- **Photo pass:** live camera, then live checks (one face, centred, facing forward, eyes visible, light, sharp; optional auto-capture), then Claude's check, then the pass order once Day 0 is confirmed.
- **Other screens:** team page with Teams chat and call, contract recap with anchor days, FAQ plus the Claude assistant (cited answers, P&P fallback), goals (locked until the start date), Day 0 confirmation, withdraw (with reason), and **Accessibility and display** settings.
- **Layouts:** desktop shows the side nav and two columns; a phone shows the bottom nav.

**Buddy (Kai):** a summary card per starter (stage, progress, chat link) and their own tasks only, with a switcher and past starters.

**Line manager (Dana):** starters list and switcher, past starters (read-only), LM tasks, bespoke tasks, team checklist items, Day 0 proposal (the starter confirms), check-ins with a Teams meeting link, buddy allocation, goals and cascaded goals, IT requests, and photo recertify.

**P&P (Imogen), at `/mi`:** key figures, the LM accountability league with major-flag rules and "Chase LM", attrition by month, stage, reason, timing and team, the early-warning list, the exit report, bottlenecks and time in stage (median and p90), vetting duration, a 13-week intake with readiness, issues and "Raise support", and CSV exports. Also `/admin/simulate` and the demo script buttons, and Record exit.

**Admin (Ada):** templates (core and team-specific), content and FAQs, teams and people, adapter MOCK/REAL switches, seeding a new starter (real Graph invite), and simulate.

## 4. Demo-day risks and mitigations

1. **Guest sign-in chain** (consent, Gmail guest settings, the localhost redirect). Rehearse now; fall back to simulated plus Alex.
2. **MFA and account switching.** Pre-sign each persona into its own browser profile before the session.
3. **Claude latency.** Run `npx tsx --conditions=react-server --env-file=.env scripts/try-ai.mts "test"` before going on. Pre-ask the chatbot question you'll use, and have a second one ready.
4. **Video and floor plan** are still placeholders. Plug in the assets you're sourcing, or skip those beats.
5. **Resetting data:** use `npm run db:seed` while the app is running, not `db:reset` (which needs the server stopped). For mock Workday, use `npm run reset` or the console's reset button.
6. **Camera and MediaPipe on the demo device:** they need HTTPS or localhost, and good, even light. Test on the actual device.

## 5. Code review round 2: being fixed now

1. The "run db:reset" messages are changing to `db:seed`, because a reset while the server runs leaves the app on stale data.
2. There's now one "overdue" rule: overdue from the day after the due date. Previously LM and MI showed Day 0 tasks as overdue on the first day.
3. The recruiter console will warn when real invites point at localhost, and the variable name is now documented correctly.
4. "Jump to Day 0" no longer records about 35 tasks as completed late (this was skewing the MI on-time rates).
5. Resetting a Workday-created starter no longer claims a buddy was allocated.
6. A second photo-review request no longer blocks the P&P override.
7. The Simulate page's demo buttons now act on the selected journey, not always Alex.
8. Reset keeps the journey in the MI funnel.
9. Intake "Behind" now also reflects early-warning signals (for example a start tomorrow with overdue LM actions).

## 6. Improvements, ranked by impact ÷ effort

**Before the demo:** plug in the video and floor plan (S); full dry run with both resets, a real invite, the phone and the photo beats (M); pre-sign-in persona profiles (S); replace the remaining `example.test` links in content with plain text (S); a small status strip on admin showing invite, AI and adapter modes (S).

**Pitch or roadmap:** Graph calendar invites for check-ins and induction; a buddy welcome in Teams; real First Advantage, Workday, SailPoint and Eptura feeds; a chatbot evaluation set; Power BI export and a time-to-productive metric; a full axe and screen-reader audit with an accessibility statement; and the privacy-by-design story (PII boundary, audit trail, human review of photos).
