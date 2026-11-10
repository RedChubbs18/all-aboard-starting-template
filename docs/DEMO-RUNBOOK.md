# Demo runbook: accounts and order

**Short pitch version:** the tight six-minute, four-segment demo is in [DEMO-SCRIPT.md](DEMO-SCRIPT.md) (run `npm run demo:prepare` first). This runbook is the longer, 15 to 18 minute walkthrough.

All MyJourney accounts are `team05-<name>@<tenant domain>`, with the passwords from the import CSVs (or whatever they were changed to at first sign-in). Run everything on the **demo laptop**: MyJourney at `http://localhost:3000`, mock Workday at `http://localhost:3001`.

## Before the session (15 minutes)

1. **Reset data.** In mock Workday, use **Reset demo data** in the recruiter console, or run `npm run reset` in `demo/mock-workday`. In MyJourney, run `npm run db:seed` while the app is running (it keeps the persona mapping). For the short pitch demo, `npm run demo:prepare` does both (and stages Alex at Day 0).
2. **Use a fresh Gmail for the live candidate.** Don't reuse the rehearsal address. Once a guest has been converted to a member, that address can't be invited as a guest again.
3. **One browser profile (or private window) per persona.** Sign each one in now, so MFA prompts are already done: Dana, Kai, Imogen, Ada and Alex.
4. **Smoke-test the AI:** `npx tsx --conditions=react-server --env-file=.env scripts/try-ai.mts "How much holiday do I get?"`
5. **Phone:** connect it to the same Wi-Fi. It's only needed to open the candidate offer link or QR code. The laptop IP can change, so check `ipconfig getifaddr en0` and restart mock Workday if it has.
6. **Photos:** have a saved photo of someone in sunglasses ready on the laptop, for the AI rejection.

## Accounts

| Persona | Account | Role in the demo |
| --- | --- | --- |
| Recruiter | none (mock Workday on the laptop) | Creates the offer |
| Candidate / new starter | **the fresh Gmail** (guest), then the **new work UPN** after conversion | The live journey from offer to Unconditional |
| Dana Sample | `team05-dana-sample` | Line manager (Digital Workplace Engineering) |
| Kai Demo | `team05-kai-demo` | Buddy |
| Imogen Sample | `team05-imogen-sample` | People & Places (MI, simulate, record exit) |
| Ada Sample | `team05-ada-sample` | Admin (templates, content, adapters) |
| Alex Morgan | `team05-alex-morgan` | Seeded starter, used for the Day 0 / Day 30 stages (a member test account, not a guest) |
| Sam Ellery | `team05-sam-ellery` | Optional: vetting "action needed" example (LM Owen) |
| Harriet Demo / Owen Placeholder | `team05-harriet-demo` / `team05-owen-placeholder` | Only if you want to show the LM side of a "chase LM" (normally shown from Imogen's MI) |

## Running order (about 15–18 minutes)

1. **Mock Workday, recruiter (laptop, `localhost:3001/recruiter`)** (about 1.5 minutes). Create an offer: team **Digital Workplace Engineering** (LM Dana, buddy Kai), job family **Engineering**, the default Monday start. Show the big link and QR code.
2. **Candidate (phone, scan the QR)** (about 1 minute). Enter a name and the **fresh Gmail**, read the offer and the device entitlement, then **Accept**. On the laptop, the recruiter timeline shows *invite sent → MyJourney journey created*.
3. **Gmail (laptop)** (about 1 minute). Open "Microsoft Invitations on behalf of …", then **Accept invitation** (you land on My Apps).
4. **New starter as a guest (Gmail, `localhost:3000`)** (about 3 minutes). Sign in with the Gmail; "Guest sign-in" ticks itself. Show:
   - the horse track and the Next step card
   - the device choice (Engineering laptops only) and the optional peripherals
   - the contract recap with anchor days
   - a **FAQ assistant** question
   - **Accessibility and display** settings (try dark theme and large text)
   - the Team page with real Teams links
5. **Dana, LM** (about 2 minutes). The new starter is in her list. Allocate buddy **Kai**, add a bespoke task, **propose Day 0**, and set a check-in (Teams meeting link).
6. **Kai, buddy** (about 30 seconds). Buddy view: the starter summary, his own tasks and a chat link.
7. **Imogen (or Ada), Admin → Simulate** (about 2 minutes). Select the **new starter**:
   - **First Advantage: action needed** → show the flag in Dana's list and in MI
   - **First Advantage: cleared** → offer conditions tick themselves → **Unconditional offer**
   - The **guest → member conversion** runs automatically, and the welcome email with the new work UPN and temporary password arrives in the Gmail inbox.
8. **New starter, work account** (about 2 minutes). Sign in with the **new work UPN** and temporary password; it asks you to change the password and set up MFA. The journey carries on at Unconditional. Show:
   - **confirm Day 0**
   - the **photo pass**: live camera checks with the capture button gated, then the AI check. Upload the sunglasses photo to show the AI rejecting it.
   - password and Authenticator checklist, induction booking, Eptura access
9. **Alex Morgan, later stages** (about 2 minutes). Via **Simulate → Jump to Day 0** on Alex, then sign in as Alex. Show:
   - the meeting point
   - the **Group Exec welcome video** (it completes on play-through)
   - collect equipment
   - goals, now unlocked
   - the "Is this task complete?" prompt
10. **Imogen, MI** (about 2 minutes):
    - **LM accountability** (major flags, **Chase LM**)
    - **attrition** (exits by stage and reason, colleague-supplied comments)
    - the **early-warning** list
    - **13-week intake** readiness
    - time in stage and bottlenecks
    - a CSV export
11. **Ada, admin** (about 1 minute):
    - templates, including the team-specific GCP checklist
    - content, including the video URL
    - adapter MOCK/REAL switches
12. *Optional:* the failed-vetting warning page (**First Advantage: failed** on a throwaway starter), or a starter withdrawing with a reason.

## If something fails

- **Sign-in trouble:** use a private window, then clear site data and retry. If you must, set `AUTH_MODE=demo` in `.env` and restart (demo personas).
- **Invite fails:** the recruiter activity log shows Graph's reason. **Retry** once, or carry on with Alex.
- **Conversion fails:** P&P/Admin sees the work-account status with **Retry**.
- **AI slow:** the chatbot falls back to "contact P&P", and the photo goes to manual review (the LM recertifies).
