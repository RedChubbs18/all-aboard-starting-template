# Integration checklist

Work to do after the WS1 to WS6 branches are merged into `main`.

- [x] Rename `hireview` to `firstadvantage` everywhere (D9): the adapter dir and key, `hireviewStatus`, template keys (`hireview-vetting-status`), the engine, schema, seed, tests and docs.
- [x] Engine (D10): First Advantage `cleared` completes the vetting task only. The stage advances when all PEV gating tasks are done, including `offer-conditions-met` (now `dependsOn: []`). The forced jump is removed. The demo's offer-conditions step completes the guest sign-in prerequisite, with a `DEMO_PREREQUISITE` event.
- [x] Engine (D13): clamp due dates so none falls before journey creation plus a grace period. Offer-to-start can be up to 3 months.
- [x] Access (D12): `canActOnTask` lets the journey's LM complete `photo-check-override`. Reconcile with the WS2 LM route.
- [x] Exit (D14), engine/service/WS3/WS4 side: `exitJourney` takes `data` (merged into the event) and validates against `src/domain/exit-reasons.ts` (single list and labels). P&P record-exit writes `comment` (what MI reads). Still to line up: WS1 starter withdraw must call `exitJourney(id, reason, { data: { reasonSource: "COLLEAGUE", comment } })`.
- [ ] Unify UI: replace local components in `src/components/{lm,mi,admin,simulate}` with `src/components/ui` primitives where practical. Have the LM detail view reuse `src/components/journey` with `readOnly` and `highlightOwner`.
- [x] Mount `NotificationBell` (WS5) in the shell; `/admin/simulate` and P&P `/admin/journeys` added to `NAV_ITEMS`.
- [ ] Add `/content` to `NAV_ITEMS` when WS1 lands it.
- [ ] Remove the placeholder `/api/journeys` once WS1 stops using it (`src/app/(starter)/journey/page.tsx` currently calls it).
- [ ] Run the full demo script (REQUIREMENTS §12) end to end at 360px.
- [ ] QA passes: accessibility, security (secrets, authz, PII), code review.
- [ ] Update CLAUDE.md commands and README run instructions.
