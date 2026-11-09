# Integration checklist

Work to do after the WS1 to WS6 branches are merged into `main`.

- [ ] Rename `hireview` to `firstadvantage` everywhere (D9): the adapter dir and key, `hireviewStatus`, template keys (`hireview-vetting-status`), the engine, schema, seed, tests and docs.
- [ ] Engine (D10): First Advantage `cleared` completes the vetting task only. The stage advances when all PEV gating tasks are done, including `offer-conditions-met`. Remove the forced jump to UNCONDITIONAL_OFFER.
- [ ] Engine (D13): clamp due dates so none falls before journey creation plus a grace period. Offer-to-start can be up to 3 months.
- [ ] Access (D12): `canActOnTask` lets the journey's LM complete `photo-check-override`. Reconcile with the WS2 LM route.
- [ ] Exit (D14): `exitJourney` stores the reason category and `reasonSource`. The comment goes in Event data only. WS1 (starter withdraw), WS4 (P&P record exit) and WS3 (report) must line up.
- [ ] Unify UI: replace local components in `src/components/{lm,mi,admin,simulate}` with `src/components/ui` primitives where practical. Have the LM detail view reuse `src/components/journey` with `readOnly` and `highlightOwner`.
- [ ] Mount `NotificationBell` (WS5) in the shell. Add `/admin/simulate` and `/content` to `NAV_ITEMS`.
- [ ] Remove the placeholder `/api/journeys` if nothing uses it.
- [ ] Run the full demo script (REQUIREMENTS §12) end to end at 360px.
- [ ] QA passes: accessibility, security (secrets, authz, PII), code review.
- [ ] Update CLAUDE.md commands and README run instructions.
