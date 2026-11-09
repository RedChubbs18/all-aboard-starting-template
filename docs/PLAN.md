# Build plan — Team 05 onboarding app

Single source of truth for the build. Agents read this before starting. The full requirements brief is in `docs/REQUIREMENTS.md` (FR-x.y references point there).

## Stack

| Concern | Choice |
| --- | --- |
| App | Next.js (App Router), TypeScript strict, Tailwind CSS |
| Auth | Real Entra ID sign-in via MSAL (`@azure/msal-browser` / `@azure/msal-react`); API validates the bearer token against Entra JWKS (`jose`). Roles come from the app database (`User.roles`), keyed by Entra `oid`. `AUTH_MODE=demo` enables a persona switcher for local dev and as a demo fallback. |
| Data | Prisma + SQLite for the demo. No PII beyond name, work email/UPN and IDs (FR-1.9). |
| Tests | Vitest. Unit tests for the journey engine; contract tests for every adapter mock. |
| PWA | Web manifest + service worker, offline shell and cached content pages. |
| Hosting | Azure, UK South, tagged `team=team05 event=hackathon`. Decided later; nothing is deployed without human approval. |

## Repo layout (contract between workstreams)

```
src/app/                    Next.js routes
  (starter)/journey/...     WS1
  lm/...                    WS2
  mi/...                    WS3
  admin/...                 WS4
  api/...                   route handlers, every one role-guarded
src/domain/                 pure logic: journey engine, stage progression, events (WS0)
src/adapters/<name>/        types.ts (interface), mock.ts (seeded mock) (WS0 interfaces, WS5 mocks)
src/adapters/registry.ts    selects mock or real per adapter by config (WS0)
src/lib/auth/               MSAL config, token validation, role guards (WS0)
src/lib/teams.ts            Teams deep-link builder (real, no Graph writes)
src/components/ui/          shared primitives built on design tokens
src/components/journey/     task cards, horse track (shared by WS1 and WS2)
prisma/schema.prisma        data model (WS0)
prisma/seed.ts              synthetic seed data (WS0, loads content/seed/)
content/seed/               synthetic content JSON (content workstream)
design/                     tokens, assets, screen specs (design workstream)
docs/                       plan, requirements, decisions
```

## Content seed contract (`content/seed/`)

- `content.json`: array of `{ slug, type, title, summary, body, stage?, tags[] }`. `type` is one of `POLICY, BENEFIT, DEVICE_INFO, WORKSPACE_INFO, CONTRACT_RECAP, GUIDE, FLOOR_PLAN, VIDEO`. `body` is Markdown. `stage` is one of the five stage keys or omitted.
- `faqs.json`: array of `{ id, question, answer, tags[], sourceSlug? }`. The chatbot answers only from these and `content.json`, citing `id`/`slug`.
- `templates.json`: array of TaskTemplate objects matching the domain model (see REQUIREMENTS §4), with a stable `key` per template and `dependsOn` listing other keys.
- `people.json`: synthetic users, teams and starters (names obviously fictional, emails on a placeholder domain `example.test` — real UPNs are mapped in local `.env`/seed overrides, never committed).

All content is illustrative and synthetic. Don't present it as real LBG policy.

## Workstreams

| WS | Scope | Agent | Depends on |
| --- | --- | --- | --- |
| WS0 | Foundations: scaffold, auth, roles, Prisma model, journey engine, adapter interfaces + registry, seed loader, design-token wiring | `nextjs-developer` | — (critical path) |
| D | Design tokens, horse track art (placeholder), mobile screen specs | `ui-designer` | — |
| C | Synthetic content, FAQs, task templates, people | `technical-writer` | — |
| WS1 | Starter journey, gamified track, content and team pages | `frontend-developer` | WS0, D, C |
| WS2 | LM dashboard | `fullstack-developer` | WS0 |
| WS3 | MI dashboard, CSV export (uses `dataviz` skill) | `fullstack-developer` | WS0 |
| WS4 | Admin interface | `fullstack-developer` | WS0 |
| WS5 | Adapter mocks + simulation controls | `typescript-pro` | WS0 |
| WS6 | FAQ chatbot + photo check | `llm-architect` / `ai-engineer` | WS4, WS5 |
| QA | Accessibility, security, review, demo-script run-through | `accessibility-tester`, `security-auditor`, `code-reviewer`, `qa-expert` | each WS |
| Infra | Entra app registration + Azure hosting | `azure-infra-engineer` | approval |

After WS0 lands, WS1–WS5 run in parallel in separate git worktrees with the file ownership above.

## Time budget (~10h)

1. 0:00–2:00 WS0 + D + C in parallel.
2. 2:00–6:30 WS1–WS5 in parallel; integrate as each lands.
3. 6:30–8:00 WS6, PWA polish, Entra + Azure deploy.
4. 8:00–9:30 QA passes, fixes, demo-script rehearsal.
5. 9:30–10:00 buffer, README, freeze.

Cut order if late (lowest value first): FR-MI.5 CSV export → FR-AD.1 dependency editing UI (seed-only) → FR-3.12 real AI photo check (mock only) → offline caching beyond the shell.

## Open decisions

Tracked in `docs/DECISIONS.md`.
