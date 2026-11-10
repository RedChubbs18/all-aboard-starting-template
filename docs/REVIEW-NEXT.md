# MyJourney: review, questions and next steps

Prepared on 2026-11-09 while the team was away. It draws on three independent reviews (a product/brief gap review, a code review and a WCAG 2.2 AA review) plus an end-to-end test of the mock Workday flow.

## 1. Where things stand

**Working and tested**
- MyJourney (port 3000) with real Entra sign-in. The account picker shows every time. Seven `team05-*` test users are mapped to personas.
- Mock Workday (port 3001). The chain recruiter offer → candidate accepts → invite → signed webhook → MyJourney creates the starter and journey was tested server-side in simulated-invite mode. No personal email reaches MyJourney.
- Real Claude for the FAQ chatbot (grounded, cited) and the photo check. There's a daily call cap, and it falls back to the mock.
- Everything from feedback round 1 (F1–F16).
- 465 automated tests, all passing.

**Fixed while you were away** (found by the code review, verified against the real templates)
- A starter seeded from Admin was stuck, because "guest invite sent" never completed.
- A Graph-invited guest couldn't sign in, because their object ID was never linked.
- Setting up Day 0 or allocating a buddy didn't tick the matching task.
- Photo recertification was impossible, and an overridden photo left the journey "blocked" forever.
- Simulating equipment or booking could tick future-stage tasks (for example "collect equipment" during Conditional offer).
- The Workday webhook wasn't truly idempotent. Retries now return the same journey, and a rehearsal with the same email gives a clear message.
- The starter's withdraw comment didn't reach the MI exit report.
- Demo reset left old Day 0, goals and check-ins behind.
- "Overdue" meant different things on the LM and MI dashboards. There's now one definition: not done, not locked, past due.
- Eptura Engage access never completed. It now completes once the internal account exists.
- The one-click demo steps now also work for a starter created through mock Workday, not only Alex Morgan.
- An unused API that leaked hidden task titles to buddies and starters was removed.

**Also fixed:** all 24 accessibility review items (see §5). 465 tests now pass.

## 2. Questions for you (decisions only the team can make)

Each has a recommended default. Answering "go with the default" is fine.

### Demo mechanics
1. **Sign-in for the judged demo: real Entra or the persona switcher?** Real Entra proves FR-1.1/§2, but adds MFA prompts and a sign-out per persona. *Default:* real Entra, using one browser profile (or private window) per persona, with demo mode plus `DEMO_PIN` as the fallback.
2. **Real or simulated invite email?** It's real only if the organisers approve external email (`NEXT_PUBLIC_GRAPH_INVITE_EXTERNAL_APPROVED=yes`). *Default:* simulated, with the on-screen preview, unless approval arrives. Use a personal Microsoft account (outlook.com) as the candidate if it's real.
3. **Photo check: real Claude or the mock?** Real mode is currently on and checks the actual image. The mock decides only by file name, so a live camera photo always passes. *Default:* real, with two rehearsed photos (one with sunglasses, one clear), and the mock as the fallback.
4. **Demo start date.** Goals lock until the start date (D21), and stage timing depends on it. *Default:* the mock Workday offer uses a start date about 2 weeks out, and "Jump to Day 0" demonstrates the rest.
5. **Who is the demo starter: Alex Morgan (seeded) or a starter created live through mock Workday?** Both now support the one-click demo steps. *Default:* open with mock Workday creating a new starter, then switch to Alex for the later stages, because Alex has richer seeded history.
6. **Teams links.** The seeded buddy and LM have `@example.test` addresses, so "Chat on Teams" opens a non-existent user. *Default:* map the buddy and LM personas to the real `team05-kai-demo` / `team05-dana-sample` UPNs, so the links open real chats. This is a small seed change, and I can do it.

### Product and content
7. **Locked stages:** the style guide asks for a 55% fade, which fails contrast. *Default:* a solid grey card with a lock icon and full-strength text. Applied as STYLE.md section A item 11. Confirm you're happy.
8. **Input borders:** the guide's `#c8d1cc` is 1.56:1, which fails WCAG for form fields. *Default:* `#767d79` for inputs only, with cards unchanged. Applied as STYLE.md section A item 12. Please confirm.
9. **Auto-complete on open** for flex benefits and development goals means a judge sees them complete with no action. *Default:* keep auto-complete for pure reading. Make flex benefits and development goals a "Mark done" action.
10. **Executive welcome video and office floor plan** are placeholders. *Default:* a 20–30 second synthetic MP4 (under 5 MB) plus an SVG floor plan labelled "example". Do you have real ones you're allowed to use?
11. **"Collect equipment"** shows generic text. *Default:* list the actual device and peripherals the starter chose, plus the collection point (small change).
12. **Second team?** Team-specific checklists only show variety with more than one team. *Default:* no, unless time allows.
13. **Should stages respect the start date?** Today a starter can reach Day 0 weeks before their first day if every task is done. *Default:* Day 0 and Day 30 unlock no earlier than the start date and start + 30, except through the demo "Jump" button.
14. **Vetting signals while the vetting task is still locked:** an "action needed" or "failed" result arriving before the starter reaches PEV is currently ignored. *Default:* show the flag to LM and P&P anyway.

### Pitch
15. **Headline outcome number.** Judges like a measurable claim. *Default:* "% of starters fully ready on Day 0" and "manual chases avoided", with a baseline from your experience if you have one.
16. **Accessibility claim.** *Default:* claim WCAG 2.2 AA "designed and reviewed", only after the accessibility fixes land and one keyboard plus screen-reader pass at 360px.
17. **Which dashboard story:** the P&P MI funnel or the LM view? *Default:* P&P funnel and exit report, with the LM view as a 30-second beat.

### Governance and clean-up
18. **Who owns clean-up before 13 November?** That means deleting the `team05-*` users and guests, purging mock Workday data (`npm run reset` in `demo/mock-workday`), deleting the CSVs, and removing the agent worktrees under `.claude/worktrees/` (they contain `.env` copies). *Default:* name one person; there's a checklist in §6.
19. **Credential hygiene:** a client secret was pasted into chat earlier. Has it been deleted in the app registration? One test user's initial password was also visible in this session, so make sure first-sign-in password changes happened.

## 3. Suggested demo script (fixes two ordering problems in REQUIREMENTS §12)

In §12 as written, "cleared → stage advances" skips the P&P offer-conditions step (D10), and "pass ordered" comes before Day 0 is confirmed, which ordering the pass requires. A working order, about 12–15 minutes:

1. **Mock Workday (2 min):** the recruiter creates an offer and shows the QR code. The candidate accepts on a phone. The invite is sent (or the simulated preview shown), and the starter appears in the MyJourney LM list.
2. **Starter on the phone (2 min):** sign in, horse track, team page with Teams chat, contract recap with anchor days, one chatbot question (for example "How much holiday do I get?").
3. **Vetting (3 min):** Simulate "First Advantage: action needed" (LM and MI flags, reminder), then "cleared", then "P&P: offer conditions met", and the stage advances. Present the two-step rule as a control, not a bug.
4. **Pre-start (2 min):** complete system tasks, choose a Mac, book induction. The **LM proposes Day 0 and the starter confirms**, *then* the photo: sunglasses rejected, clear accepted, pass ordered.
5. **LM (1 min):** a bespoke task and check-ins.
6. **Day 0 (2 min):** Jump to Day 0: meeting point, video, goals now editable, collect equipment.
7. **MI (2 min):** funnel, a starter with an overdue LM task and "Chase LM", the exit report with a colleague-supplied reason.
8. *Optional:* the failed-vetting full-page warning on a throwaway starter.

**Pre-show checklist:** `npm run db:seed` (persona mappings are kept; it works while the dev server runs), `npm run reset` in `demo/mock-workday`, start both apps, one full dry run, a Claude smoke test (`npx tsx --conditions=react-server --env-file=.env scripts/try-ai.mts "test"`), one browser profile per persona, and the two photos ready. If anything breaks, switch to `AUTH_MODE=demo` with `DEMO_PIN`.

## 4. Suggested improvements, ranked by judge impact ÷ effort

### Before the demo
| # | Suggestion | Size |
| --- | --- | --- |
| 1 | Map the demo buddy and LM to real `team05-*` UPNs so Teams links work | S |
| 2 | Real or synthetic exec video (with captions) and an SVG floor plan | S |
| 3 | "Collect equipment" lists the starter's actual choices | S |
| 4 | Flex benefits and development goals become actions, not auto-complete | S |
| 5 | Stage timing respects the start date (Q13) | S |
| 6 | One-click "Prepare demo" button: reset, set start dates, pre-create an overdue LM task for the chase demo and an exited starter | S–M |
| 7 | Refresh the README and CLAUDE.md run instructions (both apps, env vars, demo mode, Entra) | S |
| 8 | Real-browser accessibility pass at 360px with axe, after the current fixes | M |
| 9 | Install the PWA on a phone through an HTTPS tunnel (needs the tunnel URL as an extra redirect URI) | M |

### Roadmap / pitch slides
- **Microsoft 365 depth:** Graph calendar invites for check-ins and induction, Teams welcome message from the buddy, adding the starter to the team's Teams/SharePoint (Graph writes are out of MVP scope per the brief).
- **Real integrations:** First Advantage status webhooks, SailPoint/Identity events, Workday hire events, Eptura Engage desk booking.
- **AI:** an evaluation set for the chatbot (grounding and citation accuracy), multilingual answers, proactive nudges ("your vetting needs a document").
- **MI:** time-to-productive, satisfaction pulse at Day 7 and Day 30, cohort comparisons, a Power BI export.
- **Privacy by design** as a slide: the PII boundary (FR-1.9), personal email kept in Workday only, the audit trail, fail-closed photo check with human review.
- **Accessibility statement** and a light/dark theme.

## 5. Accessibility review: summary

All 24 items are fixed. They're verified by component tests (jsdom) but **not yet in a real browser or screen reader**:
- **Focus handling:** focus no longer drops to the top after "Mark done", photo retake, camera start, LM forms, buddy switch and withdrawal.
- **Voice-control labels:** four buttons get names that contain their visible text.
- **Switchers:** the LM and buddy starter dropdowns no longer navigate on change; there's an explicit button instead.
- **Contrast:** locked stages, full booking sessions and input borders (see Q7 and Q8).
- **Invite confirmation:** it becomes a proper modal dialog.
- **Video and photo:** captions on the video; photo conditions no longer rely on colour alone.
- **Layout and errors:** focused items no longer hidden under the sticky header or bottom nav, focus ring clipping fixed, and form errors announced.

Known small gaps: after saving an edited goal, focus isn't restored; the MI toast's Dismiss button drops focus. Done well already: skip link, landmarks, native dialogs, a text equivalent for the horse track, live regions, tables with captions, the camera fallbacks, reduced motion, and 44px targets.

## 6. Clean-up checklist (before 13 November)

- [ ] Delete `team05-*` users and any `team05-*` guests in Entra.
- [ ] Run `npm run reset` in `demo/mock-workday` (purges candidate personal emails).
- [ ] Delete `~/Documents/team05-personas-import.csv` and the Entra user export.
- [ ] Confirm the earlier client secret is deleted from the app registration.
- [ ] Remove `.claude/worktrees/` (old agent copies, including `.env` files).
- [ ] Make sure all code you want to keep is pushed to the fork (only the fork survives).
