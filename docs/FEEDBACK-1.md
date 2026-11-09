# Feedback round 1 (team review, 2026-11-09)

| # | Feedback | Decision / interpretation | Owner |
| --- | --- | --- | --- |
| F1 | Auto-send the guest invite email via Graph | Real Graph invite behind `IdentityAdapter`, delegated, called from the signed-in admin's browser. Hackathon mode keeps every email in the tenant (see D19). Falls back to the mock until the organisers grant consent for `User.Invite.All`. | Graph agent |
| F2 | A new starter sees only their own tasks; manager tasks hidden from the starter | The starter view shows STARTER tasks, plus a compact read-only status for SYSTEM steps (D20). LM, BUDDY and P&P tasks are hidden from the starter. Progress still counts every gating task. | Journey agent |
| F3 | Buddy tasks only after guest account creation | BUDDY tasks depend on `guest-sign-in` (logical order). | Journey agent |
| F4 | Opening the link marks reading or check tasks done | New template flag: auto-complete on open, for INFO-style tasks such as the contract recap and policies. | Journey agent |
| F5 | Desk info in Unconditional; device info (laptop, phone, headset) in Conditional | Move the workspace/desk content and tasks to UNCONDITIONAL_OFFER. Device info moves to CONDITIONAL_OFFER and covers laptop, mobile phone and headset entitlement. | Journey agent |
| F6 | After completing a manual task, move to the next one | After "Mark done", go to the next actionable task, with a short confirmation. | Journey agent |
| F7 | Vetting status at the top of the vetting stage; if vetting fails, block everything and show a warning page | The First Advantage status leads the PEV stage. If the status is `failed`, all other starter tasks are blocked and the starter sees a full-page warning: "There is an issue with your vetting. Please contact the number below." | Journey agent |
| F8 | The Checklist is locked until the join date, with lock icons | The goals page (Checklist tab) is read-only, with lock icons, until the start date (D21). | Journey agent |
| F9 | API key needed | The team supplies `ANTHROPIC_API_KEY` in local `.env`. | Team |
| F10 | IT requests owned by the buddy or LM | IT request tasks are owned by the LM. The buddy can also complete them. | Journey agent (templates and access), LM agent (UI) |
| F11 | Team checklist only shows if the LM made some | The LM can add team checklist items. The section is hidden when the starter has none. | LM agent |
| F12 | Device selection: primary device OS as its own task, peripherals as an optional task | Split into "Choose your primary device (Mac or Windows)" and an optional "Choose peripherals" task. New `optional` flag: never gating, labelled "Optional". | Journey agent |
| F13 | Day 0: the manager creates it, the joiner sees and confirms | Day 0 arrangements are an LM-owned task. The starter sees a read-only proposal with a Confirm button, and a waiting state until the LM proposes. | Journey agent (starter), LM agent (LM) |
| F14 | Fix the camera for the photo pass | Live camera via `getUserMedia` (viewfinder, oval guide, capture, retake), falling back to file upload. | Camera agent |
| F15 | LM and buddy views: a dropdown when there's more than one starter; retain records | A starter switcher when there are 2 or more starters. Completed and exited starters stay viewable under "Past starters". | LM agent (LM), Journey agent (buddy) |
| F16 | The buddy sees only their own actions | Their own BUDDY tasks, plus the starter's name, stage, progress % and a chat link. No starter task detail (D22). | Journey agent |
