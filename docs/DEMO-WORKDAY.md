# Demo: mock Workday → MyJourney

A **demo-only** mock HR system (standing in for Workday) that runs separately from MyJourney. It shows the start of the journey: a recruiter creates a conditional offer, the candidate accepts it and gets a real Microsoft Entra guest invite, and the MyJourney journey starts automatically.

The product is now called **MyJourney** (D23).

## Pieces

| | MyJourney | Mock Workday |
| --- | --- | --- |
| Folder | repo root | `demo/mock-workday/` (own `package.json`, never imported by MyJourney) |
| Port | 3000 | 3001 |
| Sign-in | Entra (MSAL) | Recruiter console only, through Entra (MSAL), same `team05-onboarding` app registration. Add `http://localhost:3001` as an extra SPA redirect URI. The candidate offer page is public, using an unguessable link. |
| Data | SQLite (`prisma/dev.db`), no PII beyond name, work contact and IDs | Its own local JSON/SQLite store in `demo/mock-workday/.data/`, which is git-ignored. It holds the candidate's personal email because Workday is the system of record. It's purged by `npm run reset` there. |

## Flow

1. **Recruiter** (signed in to mock Workday) creates an offer: role/job title, team, line manager, start date, offer conditions (e.g. "Satisfactory pre-employment vetting", "References"). Team and LM lists come from MyJourney (see the directory endpoint). The recruiter gets an offer link `http://localhost:3001/offer/<token>`.
2. **Candidate** opens the link (no sign-in), enters first name, last name and personal email, reviews the plain-language conditional offer, ticks "I accept the conditions" and clicks **Accept offer**.
3. **Mock Workday server** marks the offer `accepted_pending_invite`.
4. **Recruiter console** (left open and signed in) polls every ~3s, and for each accepted offer, from the recruiter's browser with a delegated `User.Invite.All` token:
   - `POST https://graph.microsoft.com/v1.0/invitations` with `invitedUserEmailAddress` = candidate personal email, `invitedUserDisplayName` = `team05-<first>-<last>`, `inviteRedirectUrl` = `MYJOURNEY_PUBLIC_URL`, `sendInvitationMessage: true`, `invitedUserMessageInfo.customizedMessageBody` = MyJourney access instructions (accept the invitation → sign in with this email → open MyJourney at `MYJOURNEY_PUBLIC_URL`). Only when `NEXT_PUBLIC_GRAPH_INVITE_EXTERNAL_APPROVED=yes`. Otherwise **simulate** it: no Graph call, `inviteStatus: "simulated"`, and the console shows the email that would have been sent.
   - It reports the result to its own server, which then calls the MyJourney webhook below. Retry with backoff, and mark the offer `onboarded` on success.
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
  "teamKey": "dwe",
  "lineManagerKey": "dana-sample",
  "startDate": "2027-01-11",
  "conditions": ["Satisfactory pre-employment vetting", "References"],
  "guest": { "objectId": "<guest user object id or null>", "inviteStatus": "invited" }
}
```
`inviteStatus`: `invited` | `simulated` | `failed`. It's idempotent on `offerId`: a repeat returns the same journey.

Response `200 {"journeyId": "...", "starterId": "..."}`. Errors: `401` bad signature or timestamp, `400` validation, `409` unknown team/LM.

`GET {MYJOURNEY_INTERNAL_URL}/api/integrations/workday/directory`: the same signature scheme over `"<timestamp>."` (empty body). Returns `{ "teams": [{ "key", "name", "businessArea", "lineManagers": [{ "key", "name" }] }] }` for the recruiter form.

The integration endpoints are enabled only when `WORKDAY_WEBHOOK_SECRET` is set (32+ characters). Otherwise they return 404.

## Env

MyJourney `.env`: `WORKDAY_WEBHOOK_SECRET`.
Mock Workday `demo/mock-workday/.env`: `WORKDAY_WEBHOOK_SECRET` (same value), `MYJOURNEY_INTERNAL_URL=http://localhost:3000`, `MYJOURNEY_PUBLIC_URL=http://localhost:3000`, `NEXT_PUBLIC_ENTRA_CLIENT_ID`, `NEXT_PUBLIC_ENTRA_TENANT_ID`, `NEXT_PUBLIC_ENTRA_REDIRECT_URI=http://localhost:3001`, `NEXT_PUBLIC_GRAPH_INVITE_EXTERNAL_APPROVED`.

## Rules

- **Demo only:** the README and UI banner say "Demo simulation of an HR system. Not Workday." Don't use Workday's logo or trademarked visual identity; use neutral styling.
- Synthetic offer data. Real personal emails typed during the demo live only in mock Workday's git-ignored store. Purge them after the demo.
- Guest users are created as `team05-*`. Delete them before 13 November.

## Mock Workday implementation

The mock Workday side is built in `demo/mock-workday/` (own `package.json`, port 3001). See `demo/mock-workday/README.md` for setup and the demo script.
