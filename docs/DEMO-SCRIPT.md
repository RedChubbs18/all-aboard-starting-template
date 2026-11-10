# Live demo script: MyJourney pitch (about 6 minutes)

Four segments, one story: **an offer is accepted, a new colleague is welcomed, their manager gets ready, and People and Places can see it all.** Everything runs on the demo laptop. For the full account list and the longer walkthrough, see [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md).

| # | Segment | Who | Where | Time |
| --- | --- | --- | --- | --- |
| 1 | Offer accepted, personal account added to Microsoft | Recruiter, candidate, new starter (guest) | Mock Workday `:3001`, Gmail, MyJourney `:3000` | 2:15 |
| 2 | Line manager view | Dana (`team05-dana-sample`) | `http://localhost:3000/lm` | 1:30 |
| 3 | Colleague on Day 0 | Alex (`team05-alex-morgan`, pre-staged) | `http://localhost:3000/journey` | 1:30 |
| 4 | People and Places MI | Imogen (`team05-imogen-sample`) | `http://localhost:3000/mi` | 0:45 |

## Pre-flight (do this 30 minutes before, then again 5 minutes before)

1. **Stage the data:** in the repo root run `npm run demo:prepare`. It is safe while both servers run. It purges mock Workday's offers, reseeds MyJourney in place, and stages Alex at Day 0 with today's start date. The checklist it prints should end with "Ready". Run it again on the day itself so Alex's start date is today.
2. **Servers up:** MyJourney `http://localhost:3000` and mock Workday `http://localhost:3001/recruiter` (the "Real Entra invites ON" label shows at the top right). Do not run `db:reset`.
3. **A fresh or rehearsed Gmail** for the live candidate. A Gmail that was ever converted to a member cannot be invited as a guest again, so do not reuse a finished rehearsal address. Open that Gmail in the Guest window and keep the tab ready.
4. **One browser profile per persona, each already signed in** (so MFA is done and nobody sees a login prompt): **Guest** (the Gmail), **Dana**, **Alex**, **Imogen**. Pin each window and arrange them left to right in running order. Mock Workday (recruiter and candidate) runs in a normal tab on the laptop, not in one of the persona profiles.
5. **AI check:** `npx tsx --conditions=react-server --env-file=.env scripts/try-ai.mts "How much holiday do I get?"` should answer within a few seconds.
6. **Laptop IP and QR:** if the candidate uses a phone, join the same Wi-Fi and check `ipconfig getifaddr en0`. If the laptop IP changed since last time, restart mock Workday so the QR code points at the new address. The laptop alone is enough, so the phone is optional.
7. **Close anything noisy:** notifications off, bookmarks bar hidden, browser zoom 110 percent so the back row can read.

The guest stays at **Conditional offer** in this demo, so the guest-to-member conversion does not trigger live. That is deliberate (it needs vetting to clear first). If asked: "Once vetting clears, the same account becomes a work account automatically and the new sign-in details are emailed."

## Segment 1: Offer accepted, personal account added to Microsoft (2:15)

**Window:** mock Workday tab on the laptop, then the candidate page, then the Guest window.

1. **0:00 Recruiter console.** Open `http://localhost:3001/recruiter`. Click **Fill demo offer**, then **Create offer**. The form fills with Software Engineer, Engineering, Digital Workplace Engineering, Dana Sample, the default Monday and both conditions.
   - Say: "A recruiter makes a conditional offer in Workday. One click, and it knows the team, the manager and the job family."
2. **0:25 Candidate link.** The big link and QR code appear. Open the link in a new tab (or scan the QR with the phone). Enter a first name, last name and the **Gmail address**. Point out the device entitlement ("high spec laptop for engineers"). Tick **I accept the conditions** and click **Accept offer**.
   - Say: "The candidate uses their personal email. We never put that into MyJourney."
3. **1:00 Recruiter console.** Switch back to the recruiter tab. The timeline moves: **Offer accepted, Invite sent, MyJourney journey created**.
   - Say: "Accepting the offer does three things on its own: invites their personal account into Microsoft, creates their journey, and puts it in their manager's list."
4. **1:20 Gmail (Guest window).** Open the email "Microsoft Invitations on behalf of ...", click **Accept invitation** (you land on My Apps), then open `http://localhost:3000` and sign in with the Gmail. "Guest sign-in" ticks itself.
5. **1:50 Their journey.** They land on `/journey` at **Conditional offer**: the horse track and the **Next step** card. Open the device choice quickly to show only the engineering laptops.
   - Say: "Before day one they already have a clear plan, and no new password."

**Fallbacks**

- **Invite is slow (over 30 seconds):** in the recruiter console, open the offer's **redeem link** (shown on the offer row) in the Guest window. Or say "the email is on its way" and show the pre-made screenshot of the invitation and of the starter's journey, then carry on to segment 2 (Dana already has a seeded list).
- **Invite failed:** the Activity log shows the reason; click **Retry** once. If it fails again, move on with the screenshot.
- **Sign-in issue:** open a private window, sign in again, or clear site data for localhost.
- **Phone will not load the link:** use the laptop. Nothing else changes.

## Segment 2: Line manager view, Dana (1:30)

**Window:** Dana's profile at `http://localhost:3000/lm`.

1. **0:00 The list.** Dana's starters, most urgent first. The new starter is in it (at the top of the Conditional offer group, with no flags). Say: "Dana opens one page and sees everyone starting in her team, and what needs her."
2. **0:20 Open the new starter** (the new row opens `/lm/starters/<id>`). Under **Buddy**, click **Allocate buddy**, choose **Kai Demo**, save.
   - Say: "She picks a buddy in one step. Kai's buddy tasks unlock."
3. **0:45 Propose Day 0.** Under **Day 0: your arrangements**, click **Set up Day 0**. Where: `Example House, Floor 3 reception`. Who: `Ask for Dana Sample`. Pick Monday 9:00. Save.
   - Say: "She sets the meeting point and time. The new starter confirms it on their side."
4. **1:05 Flags.** Back on the list (`/lm`), point at a row with a red or amber flag (for example a starter with vetting action needed or an overdue item). Say: "Anything stuck shows up here, so nobody is surprised on day one."

**Fallbacks:** if buddy allocation errors, refresh and retry once. If the new starter is not in the list yet (journey not created), open Alex instead; he is in the same list. Skip the flags beat if running over.

## Segment 3: Colleague on Day 0, Alex (1:30)

**Window:** Alex's profile at `http://localhost:3000/journey`. Alex is pre-staged: Day 0, start date today, Dana's arrangement confirmed, equipment chosen, induction booked.

1. **0:00 Journey home.** Stage is **Day 0**. Say: "This is the new starter's first morning."
2. **0:10 Meeting point and floor plan.** Open **Find your way on Day 0**. It shows "Example House, Floor 3 reception, 9:00am, ask for Dana Sample" and the floor plan with the "You meet here" marker.
   - Say: "Exactly what Dana set up: where, when and who."
3. **0:35 Welcome video.** Open **Watch the executive welcome video**. Play it for a few seconds, then say: "A welcome from the Group Executive." (It completes on play-through; for time, do not finish it, or skip to the end.)
4. **0:55 Collect equipment.** Open **Collect your equipment**. It shows **MacBook Pro M5 Pro** (the laptop Alex chose) plus his peripherals, and the tech bar location.
   - Say: "The laptop he chose is waiting for him, with a collection point."
5. **1:15 Goals.** Open **Draft your 30-60-90 day goals**. It is unlocked and ready.
   - Say: "Goals open on day one, so the conversation with his manager starts straight away."

**Fallbacks:** if a task page is slow, return to `/journey` and open the next one. If the video will not play (offline), say "plays the Group Exec welcome" and move on. Do not tick tasks off live; it does not matter for the story.

## Segment 4: People and Places MI, Imogen (0:45)

**Window:** Imogen's profile at `http://localhost:3000/mi`.

1. **0:00 Line managers** (`#lm`). **LM accountability**: the major-flags table and the league table. Click **Chase LM** on a row (for example Owen Placeholder). Say: "People and Places see which managers are behind, and chase them in one click. It is limited to once a day so nobody is nagged."
2. **0:20 Attrition** (`#attrition`). Exits by stage and reason, with colleague-supplied comments. Then the **Early warning** list just below it. Say: "We can see who is at risk of not turning up, before it happens."
3. **0:35 Intake** (`#intake`). The 13-week outlook. Say: "And how ready each month's intake is."

**Fallbacks:** if **Chase LM** is greyed (chased in the last 24 hours), use a different row, or run `npm run demo:prepare` again to reset. If a section is slow, jump with the section links at the top of the page.

## Close (10 seconds)

"One offer, one journey, three views: the new starter, their manager, and People and Places. And nobody had to chase anything by email."

## If it all goes wrong

- **Sign-in trouble across the board:** set `AUTH_MODE=demo` in `.env` and restart MyJourney (demo personas, one click each), then run `npm run demo:prepare`.
- **AI slow or unavailable:** the FAQ assistant falls back to "contact P&P". Skip it; it is not part of this six-minute path.
- **Data looks wrong:** `npm run demo:prepare` again. It takes a few seconds and keeps the persona mapping.
