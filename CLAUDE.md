# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Launchpad team project

This is a team's project for the Launchpad hackathon ([mwlaunchpad.com](https://mwlaunchpad.com)). All teams share one Azure and Microsoft 365 tenant and one subscription, so a mistake here can affect other teams. `M365_AZURE_INSTRUCTIONS.md` has the full rules, and `CLAUDE_CODE_INSTRUCTIONS.md` covers signing in.

## Commands

Next.js (App Router, `src/`), TypeScript strict, Tailwind v4, Prisma 6 + SQLite, Vitest. Copy `.env.example` to `.env` first. See `docs/DEV.md`.

- `npm install` (also runs `prisma generate`)
- `npm run dev` runs the app on http://localhost:3000
- `npm run build`, `npm run lint`, `npm run typecheck`
- `npm test` runs all Vitest tests (engine, adapters contract, auth, service, seed). `npx vitest run src/domain` runs one folder.
- `npm run db:push` applies the schema, `npm run db:seed` loads `content/seed/*.json` (fixtures in `prisma/fixtures/` if a file is missing), `npm run db:reset` deletes `prisma/dev.db` then push + seed.

## Architecture

- `src/domain/`: pure, framework-free journey engine (create, recompute, advance, integration status, progress) returning `Event` records. No DB or React imports here.
- `src/server/journey-service.ts`: the ONLY writer of journeys, tasks and events (one transaction per mutation). API routes call it, never Prisma writes on those tables directly.
- `src/adapters/<name>/{types,mock}.ts` plus `registry.ts` (`getAdapter(key)` returns mock or a "not configured" real stub). Mock state lives in `IntegrationState`.
- `src/lib/auth/`: `server.ts` (`requireRole`, `withRole`, token validation), `access.ts` (who sees which journey), `client.tsx` (`AuthProvider`, `useSession`), `use-api.ts`. `AUTH_MODE=demo` enables the persona switcher; anything else uses Entra.
- Every API route under `src/app/api` must be wrapped in `withRole([...], handler)`. Pages are client components behind `<RoleGate>` that load data via `useApi`.
- Design tokens live in `src/app/globals.css` (`@theme`) and follow `docs/STYLE.md` (semantic classes: `bg-page`, `bg-card`, `text-ink`, `text-muted`, `border-line`, `bg-brand`, `text-brand-strong`, `bg-dark-green`, `text-blocked`). Shared primitives are in `src/components/ui`. `node scripts/contrast-check.mjs` asserts the contrast pairings. Brand assets come from `src/lib/brand.ts` (`NEXT_PUBLIC_BRAND_ASSETS=official`).

`NN` below is the team's two-digit number. If you don't know it, ask. Don't guess.

## Azure and Microsoft 365

- Create Azure resources only in the team's own resource group.
- Never change anything belonging to another team, or any tenant-wide setting. That includes Conditional Access, security defaults, consent, domains, licensing and the Teams, SharePoint and Exchange admin policies.
- Deploy only to UK South or Italy North. Other regions fail with `RequestDisallowedByPolicy`.
- Always sign in to the hackathon tenant explicitly with `az login --tenant <tenant-domain>`. If the CLI shows the wrong subscription, run `az logout` and sign in again.
- Tag Azure resources with `--tags team=teamNN event=hackathon`.
- Prefer managed identities or OIDC federated credentials over keys and client secrets. Scope role assignments to the resource group or to a single resource, never higher.
- For Graph, use delegated permissions with the least privilege the app needs.
- Use synthetic data only. Don't give admin roles to test users, and don't send email outside the tenant.
- The team account can't create resource groups, register resource providers or raise quotas, and some role assignments fail with `AuthorizationFailed`. Hand these to the organizers instead of trying workarounds.

## Cost

- The budget is £150 for the whole event, and quotas are shared across all seven teams. This applies especially to Azure OpenAI tokens-per-minute and VM vCPUs.
- Default to Free, Basic, Consumption or serverless SKUs. Deploy AI models with modest capacity.
- On 13 November 2026 every tenant object will be deleted. Only code pushed to the fork survives.

## Naming

| What | Pattern |
| --- | --- |
| Azure resources | `<type>-teamNN-<purpose>` |
| Globally unique Azure names | Same pattern with a short random suffix, for example `kv-teamNN-a91f`. Storage accounts allow only lowercase letters and numbers, for example `stteamNNdata7x2`. |
| Entra ID app registrations | `teamNN-<purpose>` |
| Test users | `teamNN-<name>` |
| Microsoft 365 groups, Teams and SharePoint sites | `TeamNN - <name>` |

## Secrets

Treat this repo as public. Forks of it are public, and so are GitHub Actions logs. Never commit:

- Passwords, keys, client secrets, connection strings or tokens.
- Anything from the team sheet, including the account name and tenant domain.
- Tenant or subscription IDs, or CLI output, screenshots or logs that show them.

Keep real values in a local `.env`, which is ignored by git, and put placeholders in `.env.example`. `.gitignore` also excludes `*.pem`, `*.pfx`, `local.settings.json`, `appsettings.Development.json`, `.azure/` and `.claude/`. Runtime secrets go in Key Vault or app settings, and CI values go in GitHub Actions secrets. If a secret leaks, it has to be rotated. Deleting the commit isn't enough.
