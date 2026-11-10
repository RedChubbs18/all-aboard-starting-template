# Mock Workday (demo only)

A separate, demo-only mock HR system that stands in for Workday at the start of the MyJourney demo. It is **not** Workday and uses neutral styling. Every page carries the banner "Demo simulation of an HR system for the MyJourney hackathon demo. Not Workday." The contract is in `docs/DEMO-WORKDAY.md`.

It has its own `package.json` and is never imported by MyJourney (the root lint and typecheck configs ignore `demo/`).

- Recruiter console: `http://localhost:3001/recruiter` (no sign-in; limited to requests from this computer, plus an optional `RECRUITER_PIN` for other hosts).
- Candidate offer page: `http://localhost:3001/offer/<token>` (public, unguessable link).
- Data: `demo/mock-workday/.data/offers.json` (git-ignored). It holds the candidate's **personal email**, so purge it after the demo.

## Setup

```bash
cd demo/mock-workday
npm install
cp .env.example .env
```

1. Generate one shared secret and put the same value in both `.env` files as `WORKDAY_WEBHOOK_SECRET` (this file and the MyJourney root `.env`):
   `openssl rand -hex 32`
2. Leave `GRAPH_INVITE_EXTERNAL_APPROVED` and the `WORKDAY_GRAPH_*` values empty to **simulate** invites. For real invites the team creates a separate app registration (steps below), then sets `GRAPH_INVITE_EXTERNAL_APPROVED=yes` once organisers approve Entra emailing external addresses.
3. For a phone to open offer links and QR codes, set `NEXT_PUBLIC_OFFER_BASE_URL` to your computer's LAN address, for example `http://192.168.1.50:3001`. Open the recruiter console on `http://localhost:3001`. Reaching it from another host needs `RECRUITER_PIN` (otherwise 403).

### Real invites: the `team05-mock-workday` app registration

Entra admin centre -> App registrations -> New registration -> name `team05-mock-workday`, single tenant, no redirect URI -> API permissions -> Add a permission -> Microsoft Graph -> **Application permissions** -> `User.Invite.All` -> Grant admin consent -> Certificates & secrets -> New client secret (short expiry) -> copy the **Value** into this folder's `.env` only:

```
WORKDAY_GRAPH_TENANT_ID=<directory (tenant) id>
WORKDAY_GRAPH_CLIENT_ID=<application (client) id>
WORKDAY_GRAPH_CLIENT_SECRET=<secret value>
GRAPH_INVITE_EXTERNAL_APPROVED=yes
```

These are server-only (never `NEXT_PUBLIC_`), never shown in the browser, responses or logs, and never committed. Delete the secret after the event.

Run both apps: MyJourney at the repo root with `npm run dev` (port 3000), and this app with `npm run dev` here (port 3001).

Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `reset` (purges `.data/`).

## Demo script

1. Open `http://localhost:3001/recruiter` (no sign-in). The server sends the invitations, so the tab only needs to be open to watch.
2. Create an offer (job title, job family, team, line manager, start date, conditions). The start date defaults to a random Monday 2 weeks to 3 months out (**Pick another Monday** re-rolls it; the server only accepts Mondays within 3 months). The job family sets the device entitlement shown on the offer letter. Copy the link or show the QR code.
3. On a phone or another tab, open the link, read the conditional offer, enter a name and personal email, tick the box and press **Accept offer**.
4. Watch the recruiter console activity log (filled by the server): invite (real or simulated, with the message preview), then "MyJourney created the starter and their journey". The offer chip moves `accepted_pending_invite` to `invite_sent` or `invite_simulated` to `onboarded`.
5. The candidate page changes from "Setting up your access…" to "Check your email for an invitation from Microsoft to access MyJourney" with the step-by-step instructions.
6. In MyJourney, the new starter and journey (conditional offer) appear. The candidate accepts the invite, signs in to MyJourney and `guest-sign-in` completes.

Real invites to personal (for example Gmail) addresses: the candidate opens the email from Microsoft on behalf of Lloyds Banking Group (MyJourney), selects Accept invitation and signs in with the same personal email (a one-time passcode may be emailed). If the email does not arrive, the recruiter console shows the `inviteRedeemUrl` with a Copy button (recruiter console only; held in server memory, not stored, never in the candidate API; lost on a server restart).

**Rehearsal reset**: the console's **Reset demo data** button (with confirm) purges `.data/`, same as `npm run reset`. It does not touch MyJourney: run `npm run db:seed` in MyJourney to remove the created journey (it wipes and reseeds in place, so it is safe while the dev server runs; do not use `db:reset` then).

If a step fails, the chip shows `failed` with the reason and a **Retry** button.

## Security notes

- Offer tokens are 24 random bytes (base64url). One acceptance per token; offers expire after 14 days.
- No sign-in. The recruiter API accepts only loopback `Host` requests with no proxy headers; any other host needs `RECRUITER_PIN` (constant-time compare, rate limited) and fails closed when none is set. A forged `Host` header from a LAN peer is not stopped by the host check alone, so set the PIN if the app listens beyond this machine.
- The Graph client secret is server-only. The invite runs once per offer (atomic claim in the store); a crash mid-invite leaves the offer in `accepted pending invite`: check the Entra guest list, then reset or recreate the offer.
- State-changing calls need a same-origin `Origin` and a JSON body. Candidate endpoints are rate limited per IP.
- The webhook secret and HMAC signing stay server-side. The webhook body carries no personal email. Personal emails are never logged and are never sent to any browser after the candidate types them.

## Before 13 November

- `npm run reset` here to delete `.data/` (personal emails).
- Delete the `team05-*` guest users that real invites created in Entra (organiser or team admin).
- Delete the `team05-mock-workday` client secret (and the registration) and clear `WORKDAY_GRAPH_CLIENT_SECRET` from `.env`.
