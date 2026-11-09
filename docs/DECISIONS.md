# Decisions

| # | Topic | Decision | Date |
| --- | --- | --- | --- |
| D1 | Stack | Next.js + TypeScript + Tailwind + MSAL + Prisma/SQLite, Vitest (brief default). | 2026-11-09 |
| D2 | AI provider (FR-1.7, FR-3.12) | Claude via the Anthropic API behind `ChatbotAdapter` and `PhotoCheckAdapter`. The key lives only in local `.env` as `ANTHROPIC_API_KEY`, server-side only. The mock stays the default and is the demo fallback. | 2026-11-09 |
| D3 | Chase LM trigger (FR-MI.3) | Offer a chase when any LM-owned task is past its due date and not DONE. | 2026-11-09 |
| D4 | Hosting | Run locally for the demo. Mobile access and PWA install go through an HTTPS tunnel. That tunnel URL must be added as an Entra SPA redirect URI. No Azure hosting spend. | 2026-11-09 |
| D5 | Git | Commit and push freely to the fork. Run a secret scan before every push. | 2026-11-09 |
| D6 | Roles | Roles are stored in the app DB, keyed by Entra `oid`, not Entra app roles. That way the admin UI (FR-AD.3) can manage them. | 2026-11-09 |
| D8 | AI model | `claude-opus-5-5` at effort `low` for both the chatbot and the photo check. Uses structured outputs and prompt-caches the FAQ corpus. Server-side refusal fallbacks (`fallbacks: "default"`) are on. If the API errors or there's no key, it falls back to the mock. | 2026-11-09 |
| D9 | PEV provider | Pre-employment vetting uses **First Advantage**, not HireView. User-facing text says First Advantage. The code identifiers (`hireview` adapter key, `hireviewStatus`) are renamed to `firstadvantage` in one sweep after integration. | 2026-11-09 |
| D10 | Stage meanings | Conditional offer: the colleague has accepted the role. Vetting (PEV): the colleague has received the First Advantage request to enter their vetting information. Unconditional offer: PEV is complete **and** all other offer conditions are met (new gating task `offer-conditions-met`, owned by P&P). Day 0: first day. Day 30: day 30 onwards. A First Advantage "cleared" result alone must not advance the stage; it completes the vetting task, and the stage advances when all PEV gating tasks are done. | 2026-11-09 |
| D11 | Colleague File ID | Generated automatically by SailPoint (IAM), so adapterKey is `sailpoint`, not Workday. | 2026-11-09 |
| D12 | Photo recertification | Both P&P and the starter's LM can override (recertify) a rejected pass photo. | 2026-11-09 |
| D13 | Offer-to-start gap | Can be up to 3 months. Due dates are computed from the start date and clamped so none falls before the journey was created (offer acceptance) plus a small grace period. | 2026-11-09 |
| D14 | Exit reasons | Wherever possible the reason comes from the colleague. A starter can withdraw from the app, choosing a reason category and optionally adding a short comment (with a warning not to include personal details). Categories: `ACCEPTED_ANOTHER_OFFER, ROLE_NOT_RIGHT, PERSONAL_CIRCUMSTANCES, PAY_OR_BENEFITS, LOCATION_OR_HYBRID, ONBOARDING_EXPERIENCE, PREFER_NOT_TO_SAY, OTHER`, plus P&P-recorded `FAILED_PEV, OFFER_WITHDRAWN_BY_LBG, NO_SHOW`. Also stored: who supplied the reason (COLLEAGUE or PNP). | 2026-11-09 |
| D15 | Buddy | Buddies sign in with their own access. They get a read-only view of their starter, plus a chat link, and can complete BUDDY-owned tasks only. | 2026-11-09 |
| D7 | Horse graphics | Original placeholder SVGs until the team supplies official assets. | 2026-11-09 |

## Still open

- Epture (FR-3.10): what is it and who provisions it? Currently a mocked SYSTEM status task.
- Sticky colours on the board (red, green, pink, blue): owner or priority?
