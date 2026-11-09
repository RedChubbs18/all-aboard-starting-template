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
  - Production builds (`npm start`) ignore `AUTH_MODE=demo` unless `ALLOW_DEMO_MODE=1` is also set.
  - An empty, short or `change-me` `DEMO_SESSION_SECRET` is never used. The server uses a random per-process key instead (with a one-line warning), so demo sessions reset when it restarts.
  - Demo sign-in works freely only on this computer (`localhost`). Other devices get 403 unless `DEMO_PIN` is set, and then the persona switcher asks for the PIN. After 10 wrong PINs in 10 minutes, sign-in is paused.
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
3. In demo mode, also set `DEMO_PIN=<6+ digits>` in `.env`. Without it, other devices get 403 from the persona switcher. Venue Wi-Fi is shared, and demo mode can sign anyone in as ADMIN.
4. Run `npm run dev:lan`, then open `http://<that-ip>:3000` on the phone.

Over plain `http://<ip>`:

- **Demo mode (`AUTH_MODE=demo`) works with the PIN.** The persona switcher shows a PIN field. With both `ALLOWED_DEV_ORIGINS` and `DEMO_PIN` set, the laptop asks for the PIN too, because the `Host` header that marks a request as local can be faked by other devices on the network.
- **Entra sign-in doesn't work.** Entra accepts `http` redirect URIs only for `localhost`, and MSAL needs a secure context.
- **No PWA install or service worker.** Browsers allow these only on HTTPS or `localhost`.

For Entra and PWA install on a phone, use an HTTPS URL:

- **Recommended: a tunnel** (for example Microsoft Dev Tunnels: `devtunnel host -p 3000`). It gives a trusted `https://` URL. Add that URL as an extra SPA redirect URI on the `team05-onboarding` app registration, and set `NEXT_PUBLIC_ENTRA_REDIRECT_URI` to it.
- **`npm run dev:lan:https`** serves HTTPS with a locally generated certificate. The laptop trusts it, but phones won't, so they'll show warnings and won't install the PWA.

Venue Wi-Fi can isolate clients or change your IP, so check this on the day.

`npm run dev` binds to `localhost` only. Use `npm run dev:lan` to reach the app from other devices, and set `DEMO_PIN` when you do.

## Graph invites

Real Entra B2B guest invites (D19, feedback F1). Active only with `AUTH_MODE=entra` and `NEXT_PUBLIC_GRAPH_INVITES=on`. In demo mode, or with the flag off, the mock invite is unchanged.

How it works: when an admin submits "Seed a new starter", the server creates the journey and returns its id. The admin's browser then calls Microsoft Graph with a delegated token from MSAL (no client secret exists; the SPA is public):

1. `POST /invitations` with the starter's personal email (typed in the form, never stored), display name `team05-<first>-<last>`, `inviteRedirectUrl` set to the app origin and `sendInvitationMessage: false`.
2. `POST /me/sendMail` sends the branded welcome email, containing the redemption link, **only to `NEXT_PUBLIC_INVITE_DEMO_MAILBOX`**. The email says "In production this goes to" followed by the personal address. The personal address is never emailed.
3. The browser reports only the guest object id and a status to `POST /api/admin/seed-starter/[journeyId]/invite-result`. The server records it through the real IdentityAdapter and writes an audit Event.

The scopes are requested only at send time (incremental consent), not at sign-in.

**Permissions** (delegated, Microsoft Graph), added on the `team05-onboarding` app registration under API permissions, Add a permission, Microsoft Graph, Delegated permissions:

| Permission | Consent |
| --- | --- |
| `User.Invite.All` | Needs **admin consent from the organisers**. Don't grant tenant-wide consent yourself. |
| `Mail.Send` | Delegated. The signed-in admin sends as themselves. |

Until consent exists, Graph returns 403 or a consent prompt. The app then shows "The app needs organiser-approved permission to invite guests; using the demo invite instead", uses the mock invite and audits the fallback. It tries one consent redirect and never loops.

**Env vars** (`.env.example` has placeholders): `NEXT_PUBLIC_GRAPH_INVITES=on`, and `NEXT_PUBLIC_INVITE_DEMO_MAILBOX` (an in-tenant team05 test mailbox).

**In-tenant only.** No email leaves the tenant. If the mailbox variable is unset, or its domain differs from the signed-in admin's UPN domain, the app sends nothing, creates no guest, and falls back to the mock invite.

**Cleanup.** Each invite creates a real guest user named `team05-*`. Delete them before 13 November (Entra, Users, filter on `team05-`), along with any test mail.
