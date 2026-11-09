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
| D7 | Horse graphics | Original placeholder SVGs until the team supplies official assets. | 2026-11-09 |

## Still open

- Epture (FR-3.10): what is it and who provisions it? Currently a mocked SYSTEM status task.
- Sticky colours on the board (red, green, pink, blue): owner or priority?
