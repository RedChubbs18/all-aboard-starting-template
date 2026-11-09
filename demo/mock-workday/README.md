# Mock Workday (demo only)

A separate, demo-only mock HR system that stands in for Workday at the start of the MyJourney demo. It is **not** Workday and uses neutral styling. Every page carries the banner "Demo simulation of an HR system for the MyJourney hackathon demo. Not Workday." The contract is in `docs/DEMO-WORKDAY.md`.

It has its own `package.json` and is never imported by MyJourney (the root lint and typecheck configs ignore `demo/`).

- Recruiter console: `http://localhost:3001/recruiter` (Entra sign-in).
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
2. Copy `NEXT_PUBLIC_ENTRA_CLIENT_ID` and `NEXT_PUBLIC_ENTRA_TENANT_ID` from the MyJourney `.env` (same `team05-onboarding` registration).
3. In the Entra app registration `team05-onboarding`, add `http://localhost:3001` as an extra **single-page application** redirect URI (an organiser or the app owner does this).
4. Leave `NEXT_PUBLIC_GRAPH_INVITE_EXTERNAL_APPROVED` empty to **simulate** invites. Set it to `yes` only once organisers approve Entra emailing external addresses.
5. For a phone to open offer links and QR codes, set `NEXT_PUBLIC_OFFER_BASE_URL` to your computer's LAN address, for example `http://192.168.1.50:3001`. The recruiter console itself must still be opened on `http://localhost:3001` (the registered redirect URI).

Run both apps: MyJourney at the repo root with `npm run dev` (port 3000), and this app with `npm run dev` here (port 3001).

Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `reset` (purges `.data/`).

## Demo script

1. Open `http://localhost:3001/recruiter` and sign in. **Leave this tab open**: it sends the invitations.
2. Create an offer (job title, team, line manager, start date, conditions). Copy the link or show the QR code.
3. On a phone or another tab, open the link, read the conditional offer, enter a name and personal email, tick the box and press **Accept offer**.
4. Watch the recruiter console activity log: invite (real or simulated, with the message preview), then "MyJourney created the starter and their journey". The offer chip moves `accepted_pending_invite` to `invite_sent` or `invite_simulated` to `onboarded`.
5. The candidate page changes from "Setting up your access…" to "Check your email for an invitation from Microsoft to access MyJourney" with the step-by-step instructions.
6. In MyJourney, the new starter and journey (conditional offer) appear. The candidate accepts the invite, signs in to MyJourney and `guest-sign-in` completes.

If a step fails, the chip shows `failed` with the reason and a **Retry** button.

## Security notes

- Offer tokens are 24 random bytes (base64url). One acceptance per token; offers expire after 14 days.
- The recruiter API needs a valid Entra ID token (signature, issuer, audience, tenant verified with jose). Any signed-in member of the tenant counts as a recruiter.
- State-changing calls need a same-origin `Origin` and a JSON body. Candidate endpoints are rate limited per IP.
- The webhook secret and HMAC signing stay server-side. The webhook body carries no personal email. Personal emails are never logged and are only sent to the recruiter's browser while an invite is pending.

## Before 13 November

- `npm run reset` here to delete `.data/` (personal emails).
- Delete the `team05-*` guest users that real invites created in Entra (organiser or team admin).
