# Demo: mock Workday → MyJourney

A **demo-only** mock HR system (standing in for Workday) that runs separately from MyJourney. It shows the start of the journey: a recruiter creates a conditional offer, the candidate accepts it and the mock Workday server sends a real Microsoft Entra guest invite (app-only), and the MyJourney journey starts automatically.

The product is now called **MyJourney** (D23).

## Pieces

| | MyJourney | Mock Workday |
| --- | --- | --- |
| Folder | repo root | `demo/mock-workday/` (own `package.json`, never imported by MyJourney) |
| Port | 3000 | 3001 |
| Sign-in | Entra (MSAL) | **None.** Mock Workday is just an injection point for a colleague's name and email so they can be invited to the tenant (D24). The recruiter console and API accept only requests from this computer (loopback host check), plus an optional `RECRUITER_PIN`, which is required when the app is reached through any non-loopback host. The candidate offer page is public, using an unguessable link. |
| Data | SQLite (`prisma/dev.db`), no PII beyond name, work contact and IDs | Its own local JSON/SQLite store in `demo/mock-workday/.data/`, which is git-ignored. It holds the candidate's personal email because Workday is the system of record. It's purged by `npm run reset` there. |

## Flow

1. **Recruiter** (console opened on this computer, no sign-in) creates an offer: role/job title, team, line manager, start date, offer conditions (e.g. "Satisfactory pre-employment vetting", "References"). Team and LM lists come from MyJourney (see the directory endpoint). The recruiter gets an offer link `http://localhost:3001/offer/<token>`.
2. **Candidate** opens the link (no sign-in), enters first name, last name and personal email, reviews the plain-language conditional offer, ticks "I accept the conditions" and clicks **Accept offer**.
3. **Mock Workday server** marks the offer `accepted_pending_invite`.
4. **Mock Workday server**, asynchronously after the accept response and with no browser involved:
   - Claims the invite step for the offer atomically (idempotent: a real invite is never sent twice for one offer; only the recruiter's **Retry** after a failure re-arms it).
   - Gets an app-only token from the separate `team05-mock-workday` registration (`@azure/msal-node`, client credentials, scope `https://graph.microsoft.com/.default`, cached in memory), then `POST https://graph.microsoft.com/v1.0/invitations` with `invitedUserEmailAddress` = candidate personal email, `invitedUserDisplayName` = `team05-<first>-<last>`, `inviteRedirectUrl` = `NEXT_PUBLIC_MYJOURNEY_PUBLIC_URL`, `sendInvitationMessage: true`, `invitedUserMessageInfo.customizedMessageBody` = MyJourney access instructions. Only when `GRAPH_INVITE_EXTERNAL_APPROVED=yes` **and** all three `WORKDAY_GRAPH_*` values are set. Otherwise it **simulates**: no Graph call, `inviteStatus: "simulated"`, and the console shows the message that would have been sent. 429/503/504 are retried with backoff; a 403 or other failure marks the offer `failed` (Retry in the console).
   - Calls the MyJourney webhook below (retry with backoff) and marks the offer `onboarded` on success.
   - Every step's status and a short activity line (no emails, tokens or secrets) are recorded in the store.
   The recruiter console polls every ~3s and shows the live status timeline and activity log. The Entra fallback `inviteRedeemUrl` is kept in server memory only (not in the store) and returned to the recruiter console only, never to the candidate page.
5. The **candidate's offer page** updates to "Offer accepted. Check your email for an invitation from Microsoft to access MyJourney" and shows the same instructions.
6. **MyJourney** creates the starter (STARTER role, display name, `entraOid` = guest object id), the journey (CONDITIONAL_OFFER, team, LM, start date), completes `guest-invite-sent`, and audits everything. When the guest first signs in to MyJourney, `guest-sign-in` completes automatically.

## Webhook contract (Mock Workday server → MyJourney server)

`POST {MYJOURNEY_INTERNAL_URL}/api/integrations/workday/offer-accepted`

Headers:
- `content-type: application/json`
- `x-workday-timestamp: <unix seconds>` (rejected if more than 300s off)
- `x-workday-signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>" with WORKDAY_WEBHOOK_SECRET>` (constant-time compare)

Body (**no personal email or other PII beyond name**):
```json
{
  "offerId": "wd-offer-xxxx",
  "candidate": { "firstName": "Jo", "lastName": "Bloggs" },
  "jobTitle": "Software Engineer",
  "jobFamily": "ENGINEERING",
  "teamKey": "dwe",
  "lineManagerKey": "dana-sample",
  "startDate": "2027-01-11",
  "conditions": ["Satisfactory pre-employment vetting", "References"],
  "guest": { "objectId": "<guest user object id or null>", "inviteStatus": "invited" }
}
```
`jobFamily`: one of `ENGINEERING`, `DATA_AND_ANALYTICS`, `OPERATIONS`, `CUSTOMER_SERVICE`, `RISK_AND_COMPLIANCE`, `CORPORATE_FUNCTIONS` (D29: device entitlement). `startDate` defaults to a random Monday within 3 months of offer acceptance (D27).

`inviteStatus`: `invited` | `simulated` | `failed`. It's idempotent on `offerId`: a repeat (or a retry after a failure; everything is created in one transaction) returns the same journey.

Response `200 {"journeyId": "...", "starterId": "..."}`. Errors: `401` bad signature or timestamp, `400` validation, `409` unknown team/LM, or a guest that already has a journey from a different offer (a rehearsal reusing the same email: run `npm run db:seed` or use a different email).

`GET {MYJOURNEY_INTERNAL_URL}/api/integrations/workday/directory`: the same signature scheme over `"<timestamp>."` (empty body). Returns `{ "teams": [{ "key", "name", "businessArea", "lineManagers": [{ "key", "name" }] }] }` for the recruiter form.

The integration endpoints are enabled only when `WORKDAY_WEBHOOK_SECRET` is set (32+ characters). Otherwise they return 404.

## Env

MyJourney `.env`: `WORKDAY_WEBHOOK_SECRET`.

Mock Workday `demo/mock-workday/.env` (git-ignored; placeholders only in `.env.example`):

| Variable | Purpose |
| --- | --- |
| `WORKDAY_WEBHOOK_SECRET` | Same value as MyJourney's. |
| `MYJOURNEY_INTERNAL_URL` | `http://localhost:3000`. |
| `NEXT_PUBLIC_MYJOURNEY_PUBLIC_URL` | Invite redirect and the "Open MyJourney at" line. Candidates on another device cannot open `localhost`: use a tunnel URL for real invites (the console warns). |
| `WORKDAY_GRAPH_TENANT_ID` | Tenant of the app registration. Falls back to `NEXT_PUBLIC_ENTRA_TENANT_ID` if empty. **Server only.** |
| `WORKDAY_GRAPH_CLIENT_ID` | Application (client) ID of `team05-mock-workday`. **Server only.** |
| `WORKDAY_GRAPH_CLIENT_SECRET` | The client secret value. **Server only**: never `NEXT_PUBLIC_`, never sent to the browser, never logged, never committed. |
| `GRAPH_INVITE_EXTERNAL_APPROVED` | `yes` only once the organisers approve Entra emailing external addresses. The old `NEXT_PUBLIC_GRAPH_INVITE_EXTERNAL_APPROVED` is still read as a fallback. |
| `RECRUITER_PIN` | Optional. Required (and sent as `x-recruiter-pin`, prompted in the console) for requests via a non-loopback host; without a PIN such requests get 403. |
| `NEXT_PUBLIC_OFFER_BASE_URL` | Optional base for candidate links and QR codes (LAN address). |

### App registration (the team creates it; nothing here is automated)

1. Entra admin centre -> **App registrations** -> **New registration**.
2. Name `team05-mock-workday`, **single tenant**, **no redirect URI**. Register.
3. **API permissions** -> **Add a permission** -> **Microsoft Graph** -> **Application permissions** -> `User.Invite.All` -> Add.
4. **Grant admin consent** for the tenant (needs an admin or the organisers).
5. **Certificates & secrets** -> **New client secret**, short expiry (a few days).
6. Copy the secret **Value** (shown once) into `demo/mock-workday/.env` as `WORKDAY_GRAPH_CLIENT_SECRET`, with `WORKDAY_GRAPH_CLIENT_ID` and `WORKDAY_GRAPH_TENANT_ID` from the Overview page. Local only.
7. Delete the secret (and the registration) after the event.

Until these are set, and `GRAPH_INVITE_EXTERNAL_APPROVED=yes`, invites are simulated.

### Access limits

The recruiter API checks the `Host` header is loopback and that no proxy header (`x-forwarded-*`, `forwarded`) points elsewhere, which also defeats DNS rebinding and tunnels. It cannot stop someone on the same network who forges a `Host: localhost` header against a server that listens on the LAN: set `RECRUITER_PIN` (or run `next dev -H 127.0.0.1`, which also stops phones opening offer links) whenever that matters. The `Origin`/JSON CSRF checks still apply to every state-changing call.

## Rules

- **Demo only:** the README and UI banner say "Demo simulation of an HR system. Not Workday." Don't use Workday's logo or trademarked visual identity; use neutral styling.
- Synthetic offer data. Real personal emails typed during the demo live only in mock Workday's git-ignored store. Purge them after the demo.
- Guest users are created as `team05-*`. Delete them before 13 November.

## Mock Workday implementation

The mock Workday side is built in `demo/mock-workday/` (own `package.json`, port 3001). See `demo/mock-workday/README.md` for setup and the demo script.
