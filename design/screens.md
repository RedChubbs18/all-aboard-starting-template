# Screen specs (360px base, scale to >=1024px)

Global: header 56px (brand-strong bg, white text; logo placeholder + page title + avatar menu). BottomNav (starter): Journey, Team, Help (FAQ), Profile. LM/MI/Admin use a top bar on mobile and a left sidebar (240px) at >=1024px. Page padding 16px; vertical gap 16px. Max content width 1200px desktop. All lists: skeleton rows while loading; error = inline Alert (danger) with Retry. Component names refer to `components.md`.

## 1. Starter home / journey
```
[Header: Hi Alex  (avatar)]
[JourneyTrack hero + Forecast]            <- journey-track.md
[StageHeader: Day 0 - 2 of 5 done]
 v Stage 4 Day 0 (current, expanded)
   [TaskCard] Meet at Reception  [BOOKING] [LM]   Todo   due Mon
   [TaskCard] Watch welcome video [VIDEO]  [You]  Todo
 > Stage 5 Day 30 (locked, "Unlocks when Day 0 done")
 > Stage 1-3 (done, collapsed, check)
[ContactCard strip: LM, Buddy -> Chat]
[BottomNav]
```
Hierarchy: track > forecast > current stage tasks > earlier/later stages. TaskCard = title, owner Badge, status Badge, due date, chevron; whole card is one 44px+ link. Empty: "No tasks in this stage yet." Loading: track skeleton + 3 card skeletons. Error: Alert + retry; offline: banner "You're offline. Showing saved content" (PWA). Desktop: 2 columns: left 2/3 track + stages, right 1/3 sticky Forecast + contacts; BottomNav becomes top tabs.

## 2. Task detail (all variants share a shell)
Shell: back link, title (h1), badges (status, owner), due date, description, variant body, sticky bottom action bar (primary button, 56px, safe-area padding). Locked tasks: Alert info "Waiting for: <dependency title>", action disabled with `aria-disabled` and reason text (not just greyed).
```
ACTION  (e.g. Set up Authenticator)        BOOKING (Induction)
[Steps list 1..4 w/ checkboxes]            [Session list: radio cards
[link out: Open Workday (external icon)]     12 Jan 10:00 London - 4 left]
[Mark complete]                            [Confirm booking]  -> success Toast + confirmed Card

INTEGRATION_STATUS (HireView)              VIDEO
[Status panel: big Badge + text]           [16:9 player, captions on, transcript <details>]
 Not started|In progress|Action needed|    [Progress "Watched 80%"]
 Cleared|Failed                            [Mark complete auto at end; manual fallback after 3s
[What this means (plain language)]          if player errors]
[Action needed: Alert warning + "Open HireView" external link + ContactCard P&P]
[Last checked 10:42  (Refresh)]  no action button: the system completes it
```
States: INTEGRATION_STATUS loading = "Checking status..." skeleton; error = "We couldn't reach HireView. Your status hasn't changed. Try again" + P&P contact. Failed status: danger Alert + P&P contact always visible (FR-2.2). Desktop: body 640px centred, action bar becomes inline button at the bottom of the card; side panel shows stage and dependencies.

## 3. Team page (FR-1.8, FR-1.2)
```
[h1 Welcome to the team]  [Team name, "Retail Digital"]
[Reporting line: Sam (LM) > Alex (you)]  text list, not only a diagram
[ContactCard: avatar 56px | Sam Patel | Line manager | bio (3 lines, "Read more") 
              [Chat on Teams] [Call]]      buttons 44px high, equal width
[ContactCard: Jo Lee | Buddy ...]
[Members grid: 1 col]
```
Missing bio fallback: omit bio block and show muted line "Jo hasn't added a bio yet. Say hello on Teams." (no empty space). Missing photo: initials avatar on `brand-soft` bg with `brand-strong` text. Chat/Call open `msteams:` deep link via `src/lib/teams.ts`; if the app is not installed fall back to `https://teams.microsoft.com/l/...` (`target=_blank rel=noopener`). Empty team: EmptyState "Your team details will appear here once your manager confirms them." Error: Alert + retry. Desktop: members in 2-3 column grid, LM and buddy pinned in a left sticky column.

## 4. FAQ and chatbot sheet (FR-1.7)
```
[Search input 48px  "Search FAQs"]  [chips: Pay | Benefits | Equipment | Day 1]
[Accordion Q/A list]      (a result count is announced: "5 results")
                       [FAB-style bar: "Ask the assistant"]  -> opens Sheet (90% height)
Sheet: 
 [Title: Ask the assistant        (X)]
 [Notice: "Answers come from onboarding FAQs. Don't share personal data."]
 You: When do flex benefits start?
 Bot: "You can set up flex benefits on Day 0..."   
   Sources: [FAQ-12 Flex benefits] [Policy: Benefits overview]   <- link chips, 44px
   [Was this helpful? Yes | No]
 Bot (no match): "I couldn't find that in our onboarding content."
   [Contact P&P]  (primary)  [Search FAQs]
[Input + Send]
```
Rules: every bot answer MUST show at least one citation chip or the fallback card. Loading: three-dot typing indicator + `role="status"` "Assistant is replying". Error: "The assistant is unavailable" + Contact P&P + FAQ search remains usable. Chat log is `role="log" aria-live="polite"`. Focus moves into the sheet on open, returns to trigger on close, Esc closes. Desktop: the sheet becomes a 420px right-hand drawer; FAQ list stays visible.

## 5. Photo upload and AI check (FR-3.11, FR-3.12)
```
Task: Upload your ID photo
[Guidance card: Face the camera | No sunglasses or hat | Plain background | Good light]
[Preview box 3:4, dashed border]  [Take photo] [Choose file]
After select -> [Checking your photo...] progress spinner (role=status)

REJECTED:
[Alert danger: "We can't use this photo yet"]
 - Sunglasses detected. Please remove them and retake.
 - Face not clear. Move to better light.
[Retake photo] (primary)   [Ask P&P to review] (text link, manual override request)
[Submit] disabled, helper text "Submit unlocks when the photo passes."

PASS:
[Alert success: "Photo looks good"]  preview with check
[Pass delivery: Day 0 location from arrangement]
[Submit photo]  -> Toast "Pass ordered"
```
Each issue is a list item with an icon and text (not colour only), announced via `role="alert"` once. States: upload error (size/type) inline under the input; check service error: "We couldn't check your photo. Try again or ask P&P." with manual route. Uses the camera `capture="user"` attribute on mobile. Desktop: preview left, guidance and results right in 2 columns.

## 6. LM dashboard
```
LIST                                         DETAIL (starter)
[h1 Your starters]  [filter: All|Needs attention]   [back] Alex Morgan - starts 4 Jan
[StarterRow]                                  [JourneyTrack full, read-only]
 Alex Morgan | Stage: Vetting | Starts 4 Jan  [Your tasks (LM-owned, highlighted brand-soft)]
 [ProgressBar compact 45%]                      Allocate buddy  [Choose]
 [Badge Action needed] [2 overdue]              Agree check-ins [Set cadence + Teams link]
[StarterRow] ...                                Propose Day 0   [Where/When/Who]
                                               [+ Add bespoke task]  -> Sheet form
                                              [All tasks by stage list]
```
Sort: needs attention first. Empty: "No starters assigned yet." Loading skeleton rows. Error Alert + retry. Desktop: master-detail, list 360px left, detail right; at 1024 the starter list is a table (Name, Stage, Start date, Progress, Issues, Next due).

## 7. MI dashboard (P&P)
```
[h1 Intake overview]
[Filters: Business area v | Stage v | Start date range | Status v]  [Clear]   (collapse into a Sheet on mobile: "Filters (2)")
[KPI cards: Starters 48 | Blocked 6 | Overdue 11 | Exited 3]   (2x2 grid)
[Funnel: horizontal bars Conditional 48 > PEV 41 > Uncond 33 > Day0 30 > Day30 22
   each bar: label, count, % + median days in stage; data table toggle "View as table"]
[Issues table -> cards on mobile]
 Alex M | Vetting | Action needed 5d | LM: Sam P
   [Chase LM]  [Raise support]
[Exit report: stage reached + reason]  [Export CSV]
```
Chase LM: confirm Dialog "Send a nudge to Sam Patel about 2 overdue tasks?" then Toast "Nudge sent" and the button shows "Chased 10:42" (disabled 24h). Raise support: Sheet with owner prefilled (e.g. IT, Vetting), note, Submit. Colours in charts: use brand/info/warning/danger plus labels and patterns; every chart has a table alternative. Empty: "No starters match these filters" + Clear. Loading: skeleton cards and chart. Error Alert. Desktop: filters as a bar; KPIs 4-across; funnel + issues side by side; issues table with sortable columns (`aria-sort`).

## 8. Admin
```
TEMPLATES                                   SIMULATE INTEGRATION (tab)
[Tabs: Templates | Content | Teams | Adapters | Simulate]   [Alert info: "Demo tools. Changes mock adapters only."]
[Stage filter chips]                        [Select starter]
[TemplateRow] Upload photo                  [Select adapter: HireView v]
  ACTION | STARTER | due -5d | CORE         [Select event: Action needed | Cleared | Failed]
  depends on: Colleague File ID             [Run simulation] -> Toast + event log below
[+ New template] (Sheet form)               [Event log: time, adapter, event, result]
[Adapters: Mock/Real toggle per adapter, with confirm Dialog when switching to Real]
```
Template form fields: title, description, stage, owner, type, dueOffsetDays, dependsOn (multi-select), source, adapterKey. Validate inline; error text linked via `aria-describedby`. Empty: "No templates for this stage" + Add. Desktop: templates table with edit drawer (right, 480px); simulate panel is two columns (controls | event log).
