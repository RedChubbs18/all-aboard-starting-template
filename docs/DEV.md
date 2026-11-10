# Local development

## Run it

```bash
npm install
cp .env.example .env        # placeholders only; .env is gitignored
npm run db:reset            # fresh clone: create prisma/dev.db and seed it (stop the dev server first)
npm run dev                 # http://localhost:3000
```

Before pushing: `npm run build && npm run lint && npm run typecheck && npm test`.

## Scripts

| Script | What it does |
| --- | --- |
| `dev` / `build` / `start` | Next.js. `build` runs `prisma generate` first. |
| `lint`, `typecheck`, `test` | ESLint, `tsc --noEmit`, Vitest (uses its own `prisma/test.db`, recreated per run). |
| `db:push` | Apply `prisma/schema.prisma` to the SQLite file. |
| `db:seed` | Load seed data (see below). Safe to re-run, and safe while the dev server runs: it wipes the tables in place and reloads, keeping the `prisma/seed.local.json` persona mappings. Use this to get clean demo data. |
| `db:reset` | For a fresh clone or a schema change: delete `prisma/dev.db`, then push and seed. **Stop the dev server first**: a running server keeps the deleted file open and shows stale data. |

Prisma refuses `--force-reset` when invoked by an AI agent, which is why `db:reset` deletes the file instead.

## Seed data

`prisma/seed.ts` loads `.env` itself via `prisma/load-env.ts` (tsx does not), falling back to `file:./dev.db`.

`prisma/seed.ts` reads `content/seed/{content,faqs,templates,people}.json`, validated by the zod schemas in `src/domain/seed-schema.ts`. Missing files fall back to `prisma/fixtures/` (templates and people always fall back together). Invalid files fail loudly with the offending paths. People use fictional names and `@example.test` emails.

Journeys in `people.json` are instantiated through the real engine, then tasks in stages before `currentStage` are marked DONE (all tasks for completed journeys), then `taskStates` overrides apply. `firstAdvantageStatus` is stored as `IntegrationState` for `firstadvantage`.

Every seeded user has a `jobFamily` (D29: `ENGINEERING` gets MacBook Pro M5 Pro or HP EliteBook U7, everyone else MacBook Air M5 or HP EliteBook U5). There are four teams; "Cloud Platform Engineering" (`cpe`, Group Technology) has the only TEAM templates besides DWE's. Stage timing (D31): Day 0 opens no earlier than the start date and Day 30 no earlier than start + 30 days; the journey view settles for the passage of time when read, and `POST /api/simulate/tick` does it for all journeys.

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

`npm run dev` listens on all interfaces, which is the Next.js default. Binding to `localhost` alone made it IPv6-only on macOS, which broke the dev live-reload connection in Safari and caused a page-reload loop. On shared Wi-Fi in demo mode, set `DEMO_PIN`, or use Entra mode, where every API needs a token.

## Graph invites

Real Entra B2B guest invites (D19, feedback F1). Active only with `AUTH_MODE=entra`, `NEXT_PUBLIC_GRAPH_INVITES=on` **and** `NEXT_PUBLIC_GRAPH_INVITE_EXTERNAL_APPROVED=yes`. In demo mode, or with the flag off, the mock invite is unchanged.

How it works: when an admin submits "Seed a new starter", the server creates the journey and returns its id. The admin's browser then calls Microsoft Graph with a delegated token from MSAL (no client secret exists; the SPA is public):

1. `POST /invitations` with the personal email typed in the form at demo time (never stored), display name `team05-<first>-<last>`, `inviteRedirectUrl` set to the app origin, `sendInvitationMessage: true` and a short `customizedMessageBody`. **Microsoft Entra sends its own standard invitation email.** The app drafts no email, sets no `ccRecipients` and never calls `/me/sendMail`.
2. The form shows a confirmation dialog ("Send a real Microsoft Entra invitation email to <address>?") before anything is created. The personal email is required for a real send.
3. The browser reports only the guest object id and a status to `POST /api/admin/seed-starter/[journeyId]/invite-result`. The server records it through the real IdentityAdapter and writes an audit Event.

The scopes are requested only at send time (incremental consent), not at sign-in.

**Permissions** (delegated, Microsoft Graph), added on the `team05-onboarding` app registration (only this one) under API permissions, Add a permission, Microsoft Graph, Delegated permissions:

| Permission | Consent |
| --- | --- |
| `User.Invite.All` | Needs **admin consent from the organisers**. Don't grant tenant-wide consent yourself. |

Until consent exists, Graph returns 403 or a consent prompt. The app then shows "The app needs organiser-approved permission to invite guests; using the demo invite instead", uses the mock invite and audits the fallback. It tries one consent redirect and never loops.

**Env vars** (`.env.example` has placeholders): `NEXT_PUBLIC_GRAPH_INVITES=on` and `NEXT_PUBLIC_GRAPH_INVITE_EXTERNAL_APPROVED=yes`.

**Approval flag.** The invitation email can reach an address outside the tenant, which the hackathon rules forbid unless the organisers approve. Set `NEXT_PUBLIC_GRAPH_INVITE_EXTERNAL_APPROVED=yes` only after they have approved it. Without it the app never calls Graph, uses the mock invite, shows "External invite email not approved for this environment" and audits the fallback.

**Cleanup.** Each invite creates a real guest user named `team05-*`. Delete them before 13 November (Entra, Users, filter on `team05-`).

## Guest to member conversion

D39. When a starter reaches `UNCONDITIONAL_OFFER`, `src/server/identity-conversion.ts` converts their Entra B2B guest into an internal member (same object id, so sign-in mapping by `entraOid` keeps working), updates `User.upn`, completes the `internal-account-created` task and emails the new sign-in name and a temporary password to their personal address. P&P and Admin see the state ("Work account: converted on ... / pending / failed") on the starter detail and the admin journeys list, with Retry (`POST /api/admin/journeys/[id]/convert`). The starter sees a notice on their journey.

**Application permissions** on the existing MyJourney app registration (admin consent by the organisers; nobody here grants tenant-wide consent):

- `User-ConvertToInternal.ReadWrite.All` (least privileged for the convert call)
- `User.Read.All` (read the guest's type and personal email)
- `Mail.Send` (send the email; `MYJOURNEY_MAIL_SENDER_UPN` must be a licensed mailbox)

**Server-only env** (placeholders in `.env.example`; real values only in the ignored local `.env`): `GUEST_CONVERSION=on`, `MYJOURNEY_GRAPH_CLIENT_ID`, `MYJOURNEY_GRAPH_CLIENT_SECRET` (short-lived; delete after the event), `MYJOURNEY_MAIL_SENDER_UPN`, `MEMBER_UPN_DOMAIN` (the tenant's onmicrosoft domain, never committed), optional `NEXT_PUBLIC_MYJOURNEY_PUBLIC_URL` (link in the email; default `http://localhost:3000`). The tenant id comes from `NEXT_PUBLIC_ENTRA_TENANT_ID`. If any is missing the run is **simulated**: no Graph call, `conversion_simulated` is recorded and shown in the UI, and nothing else changes.

Behaviour and limits:

- Only STARTER users with an `entraOid`, whose Entra user is a Guest created by invitation and whose display name starts with `team05-`, are converted. Anything else is refused.
- New UPN `team05-<first>-<last>@<MEMBER_UPN_DOMAIN>`, with `-2`, `-3`... on a conflict. A 20-character random password with `forceChangePasswordNextSignIn: true` is generated per conversion, held in memory only, never stored or logged. The personal email is read from Graph and used once, never stored or logged. Error text stored or shown has emails redacted.
- Idempotent: once `converted` it never converts twice. If the email fails, the account stays converted and the UI warns that the email was not sent; the password cannot be re-sent (it is not stored), so an admin must reset it in Entra.
- **Beta API caveat:** `convertExternalToInternalMemberUser` exists only under `/beta` and may change without notice.
- **MFA/SSPR caveat:** Microsoft does not document whether a guest's MFA or self-service password reset registrations carry over, so a temporary password and Authenticator set-up are always required.
- The converted users are `team05-` test accounts and are deleted with the tenant on 13 November 2026.
- The starter's guest session may stop working after conversion; the sign-in screen already forces the account picker so they can choose the work account.

## Entra test users for the personas

1. Ask Claude to generate the bulk-create CSV, or reuse the one in your Documents folder. It's never committed, because it holds initial passwords.
2. In the Entra admin centre, go to **Users → Bulk operations → Bulk create**. Replace `TENANT-DOMAIN` in the CSV with the tenant domain from your team sheet, upload it, and wait for the job to finish.
3. Go to **Users → Download users** and export a CSV.
4. Run `node scripts/map-entra-users.mjs <export.csv>`, then `npm run db:seed`. This writes the git-ignored `prisma/seed.local.json`, which maps `team05-<persona>` users onto the seed personas by object ID.
5. Set `AUTH_MODE=entra` in `.env`, restart, and sign in as `team05-<persona>@<tenant-domain>`.
6. Delete the CSVs afterwards, and delete the `team05-*` users before 13 November.

## Mock Workday demo

A separate demo-only app in `demo/mock-workday/` (port 3001) stands in for an HR system and starts journeys in MyJourney through a signed webhook. The contract, flow and env vars are in [DEMO-WORKDAY.md](DEMO-WORKDAY.md).

MyJourney side: generate a secret with `openssl rand -hex 32`, put it in `.env` as `WORKDAY_WEBHOOK_SECRET`, and use the same value in `demo/mock-workday/.env`. Without it (or with a placeholder or fewer than 32 characters) `/api/integrations/workday/*` returns 404. The routes are server-to-server: they use the HMAC signature instead of cookies or bearer tokens, so they skip the CSRF/Origin check. In Entra mode, a starter's first sign-in completes their `guest-sign-in` task automatically.
