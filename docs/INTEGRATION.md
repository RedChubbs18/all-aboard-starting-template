# Integration checklist

Work to do after the WS1 to WS6 branches are merged into `main`.

- [x] Rename `hireview` to `firstadvantage` everywhere (D9): the adapter dir and key, `hireviewStatus`, template keys (`hireview-vetting-status`), the engine, schema, seed, tests and docs.
- [x] Engine (D10): First Advantage `cleared` completes the vetting task only. The stage advances when all PEV gating tasks are done, including `offer-conditions-met` (now `dependsOn: []`). The forced jump is removed. The demo's offer-conditions step completes the guest sign-in prerequisite, with a `DEMO_PREREQUISITE` event.
- [x] Engine (D13): clamp due dates so none falls before journey creation plus a grace period. Offer-to-start can be up to 3 months.
- [x] Access (D12): `canActOnTask` lets the journey's LM complete `photo-check-override`. Reconcile with the WS2 LM route.
- [x] Exit (D14), engine/service/WS3/WS4 side: `exitJourney` takes `data` (merged into the event) and validates against `src/domain/exit-reasons.ts` (single list and labels). P&P record-exit writes `comment` (what MI reads). The starter withdraw route now calls `exitJourney(id, reason, { actorId, data: { reasonSource: "COLLEAGUE", comment } })` (no separate `JOURNEY_EXIT_DETAIL` event) and its reason list is built from `COLLEAGUE_REASONS`.
- [ ] Unify UI: replace local components in `src/components/{lm,mi,admin,simulate}` with `src/components/ui` primitives where practical. Have the LM detail view reuse `src/components/journey` with `readOnly` and `highlightOwner`.
- [x] Mount `NotificationBell` (WS5) in the shell; `/admin/simulate` and P&P `/admin/journeys` added to `NAV_ITEMS`.
- [ ] Add `/content` to `NAV_ITEMS` when WS1 lands it.
- [x] Remove the placeholder `/api/journeys`: nothing called it (the starter journey page uses `/api/starter/journey`), and it leaked hidden task titles to starters and buddies (D20, D22). Deleted.
- [ ] Run the full demo script (REQUIREMENTS §12) end to end at 360px.
- [ ] QA passes: accessibility, security (secrets, authz, PII), code review.
- [ ] Update CLAUDE.md commands and README run instructions.

## Verified-bug fixes (real-template regression pass)

Tests for these load the real `content/seed/templates.json` (`src/domain/real-templates.test.ts`, `src/server/regression.test.ts`).

- [x] Seeded starters and Graph/mock invites complete `guest-invite-sent`; the Graph invite report links `User.entraOid` (409 if the object id belongs to another user).
- [x] `photo-check-override` has no dependency (the `photo-check-failed` condition gates it); `requestPhotoReview` blocks `photo-check-passed`; `progress()` counts effectively-done tasks; after an override `orderPassAfterRecertification` lets the pass order proceed once Day 0 is confirmed.
- [x] `proposeDay0` and `allocateBuddy` complete their tasks in the same transaction.
- [x] `applyIntegrationStatus` skips LOCKED tasks and recognises `collected`, `delivered`, `printed`, `fulfilled`. A `cleared` vetting result that arrives early completes the task on the next reconcile.
- [x] Workday webhook is idempotent per offer, atomic, and returns 409 for a guest reused under another offer.
- [x] Demo reset clears Day 0, goals, check-ins and events (only `DEMO_RESET` remains) and keeps the `workday-offer` link row.
- [x] `system_tasks` demo step works when identity (or SailPoint) is REAL, and completes Eptura Engage (the rule: internal account exists).
- [x] One `isOverdue` helper (D3 clarification). Demo `jump_day0` and `reset` also accept journeys created by the mock Workday webhook.
