# Local development

## Run it

```bash
npm install
cp .env.example .env        # placeholders only; .env is gitignored
npm run db:reset            # recreate prisma/dev.db and seed it
npm run dev                 # http://localhost:3000
```

Before pushing: `npm run build && npm run lint && npm run typecheck && npm test`.

## Scripts

| Script | What it does |
| --- | --- |
| `dev` / `build` / `start` | Next.js. `build` runs `prisma generate` first. |
| `lint`, `typecheck`, `test` | ESLint, `tsc --noEmit`, Vitest (uses its own `prisma/test.db`, recreated per run). |
| `db:push` | Apply `prisma/schema.prisma` to the SQLite file. |
| `db:seed` | Load seed data (see below). Safe to re-run: it wipes and reloads. |
| `db:reset` | Delete `prisma/dev.db`, then push and seed. |

Prisma refuses `--force-reset` when invoked by an AI agent, which is why `db:reset` deletes the file instead.

## Seed data

`prisma/seed.ts` loads `.env` itself via `prisma/load-env.ts` (tsx does not), falling back to `file:./dev.db`.

`prisma/seed.ts` reads `content/seed/{content,faqs,templates,people}.json`, validated by the zod schemas in `src/domain/seed-schema.ts`. Missing files fall back to `prisma/fixtures/` (templates and people always fall back together). Invalid files fail loudly with the offending paths. People use fictional names and `@example.test` emails.

Journeys in `people.json` are instantiated through the real engine, then tasks in stages before `currentStage` are marked DONE (all tasks for completed journeys), then `taskStates` overrides apply. `firstAdvantageStatus` is stored as `IntegrationState` for `firstadvantage`.

Optional `prisma/seed.local.json` (gitignored) maps seeded users to real identities. Keys are the user `key` from `people.json`:

```json
{ "users": { "dana-sample": { "entraOid": "<object id>", "upn": "<real upn>" } } }
```

## Auth modes

Set by `AUTH_MODE`.

- `demo` (the `.env.example` default). The home page lists every seeded user. Picking one sets a signed, httpOnly `demo_session` cookie (`DEMO_SESSION_SECRET`). Demo mode is active only when the variable is exactly `demo`; any other value, or unset, means Entra. The persona endpoints return 404 outside demo mode.
- `entra`. Set `NEXT_PUBLIC_ENTRA_CLIENT_ID`, `NEXT_PUBLIC_ENTRA_TENANT_ID` (the tenant GUID, used as the authority so B2B guests work) and `NEXT_PUBLIC_ENTRA_REDIRECT_URI` (a SPA redirect URI on the app registration). The browser signs in with MSAL and sends the ID token as `Authorization: Bearer`. The server verifies signature, issuer, audience (client id or `api://client id`), expiry and `tid` against the tenant JWKS, maps `oid` to `User.entraOid`, and loads roles from the database. A valid Entra user with no `User` row sees the "not onboarded yet" page (HTTP 403 `not_onboarded`). No Entra app registration exists yet; infra creates it later.

Roles: STARTER, BUDDY, LM, PNP, ADMIN (a user can hold several, stored in `User.roles`). Visibility rules are in `src/lib/auth/access.ts`: LM sees journeys where `lmId` is self, buddy is read-only on their allocated starter, starter sees only their own journey, PNP and ADMIN see all.

## Writing features

- Journey changes: call `src/server/journey-service.ts`. Never write `Task`, `Journey` or `Event` rows elsewhere.
- API routes: `export const GET = withRole(["LM", "PNP"], async (req, ctx, user) => ...)`, then scope data with `journeyScopeWhere(user)` / `canViewJourney` / `canActOnTask`.
- Pages: client components inside `<RoleGate roles={[...]}>`, data from `useApi("/api/...")` or `useSession().apiFetch`. In Entra mode the identity is a bearer token, so server components cannot see the user.
- Adapters: `const hv = await getAdapter("firstadvantage")`. Admin simulation: `isSimulatable(a)` then `a.simulate(journeyId, status)`, followed by `applyIntegrationStatus(journeyId, "firstadvantage", status)` in the journey service.
- Teams links: `src/lib/teams.ts` (`chatLink`, `callLink`, `meetingLink`).

## PWA

`public/manifest.webmanifest`, icons in `public/icons/`, and `public/sw.js`. The service worker is registered only in production builds (`npm run build && npm start`), so dev hot reload is unaffected. It caches the offline page, navigations (network first), `/_next/static` and `/content/*` (stale-while-revalidate), and never caches `/api`.

## Running on the LAN (phones on the same Wi-Fi)

1. Find the laptop's IP: `ipconfig getifaddr en0` on macOS.
2. Add it to your local `.env`: `ALLOWED_DEV_ORIGINS=<that-ip>`. Don't commit it.
3. Run `npm run dev:lan`, then open `http://<that-ip>:3000` on the phone.

Over plain `http://<ip>`:

- **Demo mode (`AUTH_MODE=demo`) works.** The persona switcher and every page are fine.
- **Entra sign-in doesn't work.** Entra accepts `http` redirect URIs only for `localhost`, and MSAL needs a secure context.
- **No PWA install or service worker.** Browsers allow these only on HTTPS or `localhost`.

For Entra and PWA install on a phone, use an HTTPS URL:

- **Recommended: a tunnel** (for example Microsoft Dev Tunnels: `devtunnel host -p 3000`). It gives a trusted `https://` URL. Add that URL as an extra SPA redirect URI on the `team05-onboarding` app registration, and set `NEXT_PUBLIC_ENTRA_REDIRECT_URI` to it.
- **`npm run dev:lan:https`** serves HTTPS with a locally generated certificate. The laptop trusts it, but phones won't, so they'll show warnings and won't install the PWA.

Venue Wi-Fi can isolate clients or change your IP, so check this on the day.
