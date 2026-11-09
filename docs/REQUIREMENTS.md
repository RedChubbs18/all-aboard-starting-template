# Requirements brief

Provided by Team 05 on 2026-11-09. FR references used throughout the build point here.

## 1. Purpose

Build one centralised, mobile-first web app that guides a new colleague from conditional offer through Day 30. It pulls the scattered parts of onboarding (access, vetting, equipment, bookings, training, team intro, goals) into one place, with a gamified journey for the starter, a dashboard for line managers (LM), MI for People & Places (P&P), and an admin interface.

## 2. Constraints and principles

- Responsive web app, mobile-first (designed at 360px up), installable as a PWA. No native apps.
- Real Microsoft Entra ID sign-in (MSAL). Real Microsoft Teams deep links for chat and calls.
- Every other integration (HireView, Workday, SailPoint, IT@LBG, equipment ordering, ID pass, induction booking, notifications, AI) sits behind a typed adapter interface with a mock implementation for the MVP.
- The app never stores critical personal data. Workday and HireView remain the systems of record for PII and vetting; the app stores only status, references and task progress.
- All journey content is data-driven (templates), never hard-coded per stage.

## 3. Roles

- **Starter**: the new colleague. Signs in as an Entra B2B guest (personal email) pre-start, then with their internal LBG account.
- **Buddy**: a team member (not the LM) allocated to the starter. Read-only view of the starter's progress plus chat link.
- **Line Manager**: owns team-specific tasks, bespoke tasks, check-ins and Day 0 arrangements.
- **P&P / Onboarding team**: monitors intakes, chases blockers, owns induction and MI.
- **Admin**: manages journey templates, content, FAQs and adapter configuration.

## 4. Core domain model

- **Journey**: one per starter. Fields: starterId, lmId, buddyId, startDate, currentStage, status (active, completed, exited), exitReason.
- **Stage**: CONDITIONAL_OFFER, PEV, UNCONDITIONAL_OFFER, DAY_0, DAY_30.
- **TaskTemplate**: title, description, stage, owner (STARTER, LM, BUDDY, PNP, SYSTEM), type (INFO, ACTION, BOOKING, ORDER, INTEGRATION_STATUS, TRAINING, VIDEO, CHECKLIST), dueOffsetDays relative to startDate, dependsOn[], source (CORE, TEAM, BESPOKE), adapterKey (optional).
- **Task**: instance of a template on a journey. status (LOCKED, TODO, IN_PROGRESS, BLOCKED, DONE), dueDate, completedAt, blockedReason, evidence (reference only).
- **Team**: name, members (name, role, photo, reporting line, bio).
- **CheckIn**: journeyId, cadence, scheduledAt, Teams meeting link.
- **Event**: audit trail of every status change, used for MI.
- **Stage progression rule**: a stage unlocks when its gating tasks are done or a SYSTEM integration status changes (e.g. HireView "cleared" moves the journey to UNCONDITIONAL_OFFER).

## 5. Functional requirements by stage

### Stage 1: Conditional Offer

- **FR-1.1 Guest access.** Starter is invited as a guest via personal email to the LBG Entra tenant with conditional access. AC: invite is triggered through the IdentityAdapter (mocked); starter can sign in with Entra and lands on their journey.
- **FR-1.2 Teams communication.** Deep links to chat with the team, LM and buddy. AC: each contact card has a working Teams chat link built from the contact's UPN.
- **FR-1.3 Buddy allocation.** LM allocates a buddy from their team (not themselves). AC: starter sees buddy profile and chat link; buddy sees starter progress.
- **FR-1.4 Gamified journey visualisation.** Visual track of the journey using LBG horse graphics, showing progress and a forecast of remaining tasks that updates dynamically. AC: completing a task moves the horse along the track; remaining task count and next due dates update without reload.
- **FR-1.5 Contract key details.** Plain-language recap of key conditions and contract terms, including anchor days. AC: content is template-driven and shows the starter's anchor days pulled from WorkdayAdapter (mocked).
- **FR-1.6 Device and workspace info.** Information on device choice, peripherals, desks and monitors. AC: content page linked from the relevant tasks.
- **FR-1.7 FAQ with AI chatbot.** Searchable FAQ plus an AI chat assistant grounded in the FAQ and policy content. AC: chatbot answers from admin-managed content only, cites the source FAQ, and offers a "contact P&P" fallback.
- **FR-1.8 Welcome to the Team.** Team page with roles, profile pictures, reporting line and bio where available. AC: renders from Team data; missing bios degrade gracefully.
- **FR-1.9 PII boundary.** Personal data and vetting stay in Workday and HireView. AC: no PII fields in the app database beyond name, work contact and IDs; links out to Workday and HireView where the starter must act.

### Stage 2: Pre-Employment Vetting (PEV)

- **FR-2.1 Policies and benefits.** General policies including benefits available as content. AC: admin-managed content cards.
- **FR-2.2 PEV support.** Reminder notifications if PEV steps are incomplete, plus contact information if there is an issue. AC: NotificationAdapter sends reminders on a schedule while status is incomplete; contact card is always visible on this stage.
- **FR-2.3 HireView status.** Monitor vetting status via HireViewAdapter (mocked). AC: status (not started, in progress, action needed, cleared, failed) shows on the journey; "cleared" advances the stage; "action needed" flags the journey in LM and MI dashboards.

### Stage 3: Unconditional Offer (pre-start)

- **FR-3.1 Internal account.** Internal LBG account created with a pre-start conditional access policy. AC: SYSTEM task completed by IdentityAdapter callback (mocked).
- **FR-3.2 SailPoint persona.** Pre-start account persona applied automatically. AC: SYSTEM task via SailPointAdapter (mocked).
- **FR-3.3 Colleague File ID.** Once the ID exists, IT@LBG requests can be raised. AC: IT request tasks stay LOCKED until the ID exists.
- **FR-3.4 MS password and Authenticator.** Guided setup before Day 1. AC: step-by-step checklist; starter marks complete; overdue flags to LM.
- **FR-3.5 Team-specific checklist.** LM sees a team-specific checklist of requests and orders to complete. AC: TEAM tasks generated from the team's template.
- **FR-3.6 Bespoke LM tasks.** LM can add bespoke tasks for the starter. AC: LM creates a task with title, description, stage and due date; it appears on the starter journey immediately.
- **FR-3.7 Device choice.** Starter selects Mac or Windows and Day 0 peripherals. AC: selection submitted via EquipmentAdapter (mocked); confirmation shown.
- **FR-3.8 Day 0 arrangements.** Agree where, when and who for Day 0. AC: LM proposes; starter confirms; shown on Day 0 stage.
- **FR-3.9 Induction booking.** Booking available for the monthly "Welcome to Lloyds" induction with P&P. AC: starter picks a session via BookingAdapter (mocked).
- **FR-3.10 Epture access.** Epture access made available. AC: SYSTEM status task (mocked). Needs clarification, see open questions.
- **FR-3.11 Photo ID pass.** Pass ordered to the Day 0 location. AC: starter uploads a photo; order submitted via PassAdapter (mocked) to the agreed location.
- **FR-3.12 AI photo check.** Before submitting, the photo is checked for sunglasses, hats or an unclear face. AC: PhotoCheckAdapter returns pass or a list of issues; submission blocked until pass or a manual override by P&P.
- **FR-3.13 Team calls.** LM forwards or adds all recurring team calls from the start date. AC: LM task with checkbox; optional Teams link list.
- **FR-3.14 Mandatory training.** Workday mandatory training made available. AC: training list from WorkdayAdapter (mocked) with completion status.

### Stage 4: Day 0 / Start

- **FR-4.1 Home working order guide.** Guide for ordering desk, monitor and other home working items. AC: content plus order action via EquipmentAdapter.
- **FR-4.2 Flex benefits.** Prompt to review and configure flex benefits. AC: task links out to the benefits platform.
- **FR-4.3 Mandatory training checklist.** AC: checklist with live status from Workday (mocked).
- **FR-4.4 Office wayfinding.** Floor plans and the agreed first-day meeting point. AC: image or map plus the Day 0 arrangement from FR-3.8.
- **FR-4.5 Induction fallback.** Book induction if not already booked. AC: task only appears if FR-3.9 is incomplete.
- **FR-4.6 Executive welcome video.** AC: embedded video task; marks complete on play-through.
- **FR-4.7 Regular check-ins.** Regular check-in agreed with LM. AC: CheckIn record with cadence and Teams link.
- **FR-4.8 Collect equipment.** Collect laptop and agreed peripherals from the tech bar or mailroom. AC: shows the items chosen in FR-3.7 and the collection point.
- **FR-4.9 30-60-90 day goals.** Goals established with LM. AC: starter and LM both see and edit a simple goals list.

### Stage 5: Day 30

- **FR-5.1** Performance goals guidance, including business area and LM cascaded goals. AC: content plus LM-entered cascaded goals.
- **FR-5.2** Development goals guidance. AC: content task; journey marks completed when all Day 30 gating tasks are done.

## 6. Line Manager dashboard

- **FR-LM.1** List of current and upcoming starters with stage, progress and overdue or blocked tasks.
- **FR-LM.2** Starter detail view mirroring the starter journey, with LM-owned tasks highlighted.
- **FR-LM.3** Agree pre-start check-ins (cadence and Teams meeting link).
- **FR-LM.4** Allocate buddy, add bespoke tasks, propose Day 0 arrangements (links to FR-1.3, FR-3.6, FR-3.8).
- AC: an LM sees only their own starters; actions update the starter view immediately.

## 7. MI dashboard (P&P, larger intakes)

- **FR-MI.1** Intake overview: starters by stage, start date, business area, with filters.
- **FR-MI.2** Issue identification: highlight blocked, overdue or failed steps across the journey, with a "raise support" action routed to the right owner.
- **FR-MI.3** Chase LM: one-click nudge to an LM with overdue LM-owned tasks (NotificationAdapter). Trigger condition to be confirmed.
- **FR-MI.4** Exit data: capture and report on starters who exit the journey (stage reached and reason).
- **FR-MI.5** Funnel and time-in-stage metrics derived from the Event log. Export to CSV.

## 8. Admin interface

- **FR-AD.1** Manage task templates per stage (core and team-specific), including dependencies and due offsets.
- **FR-AD.2** Manage content: policies, benefits, device info, floor plans, videos, FAQs.
- **FR-AD.3** Manage teams, LMs and buddy eligibility.
- **FR-AD.4** Toggle adapters between mock and real; view mock state and simulate integration events (e.g. "HireView cleared") for demos.

## 9. Integration adapters

Each adapter has a TypeScript interface, a mock implementation with seeded data, and a single registry that selects mock or real by config. Required adapters: IdentityAdapter (Entra guest invite, internal account, conditional access), SailPointAdapter, HireViewAdapter, WorkdayAdapter (anchor days, training), ITRequestAdapter (IT@LBG), EquipmentAdapter, PassAdapter, BookingAdapter, PhotoCheckAdapter, ChatbotAdapter, NotificationAdapter. Teams is real: deep-link builder only, no Graph writes in the MVP.

## 10. Non-functional requirements

- Accessibility: WCAG 2.2 AA, keyboard and screen-reader friendly, the gamified track has a text equivalent.
- Mobile-first, PWA installable, offline shell with cached content pages.
- Security: Entra sign-in, role-based access per route and API, no PII at rest, audit Event on every state change.
- Performance: journey view interactive in under 2 seconds on mid-range mobile.
- Testability: unit tests for stage progression and task unlocking; adapter contract tests run against mocks.

## 11. Workstreams and dependencies

- WS0 Foundations: repo, auth (Entra via MSAL), roles, data model, adapter interfaces and registry, seed data, design tokens. Blocks everything else.
- WS1 Starter journey: stages, tasks, gamified track, content pages, team page (needs WS0).
- WS2 LM dashboard (needs WS0, shares task components with WS1).
- WS3 MI dashboard (needs WS0 Event log).
- WS4 Admin interface (needs WS0 templates and content model).
- WS5 Adapter mocks and simulation controls (needs WS0 interfaces; feeds WS1 to WS4).
- WS6 AI features: FAQ chatbot and photo check (needs WS5 adapters and WS4 FAQ content).
- After WS0, WS1 to WS5 can run in parallel; WS6 follows WS4 and WS5.

## 12. End-to-end demo script

1. Admin shows the template for a team and seeds a new starter with LM and start date.
2. Starter signs in with Entra on mobile, installs the PWA, sees the horse journey, meets the team and opens a Teams chat with the buddy.
3. Starter views contract recap with anchor days and asks the chatbot a benefits question.
4. Admin simulates HireView "action needed": reminder fires, journey flags red on LM and MI dashboards. Then simulates "cleared": stage advances.
5. System tasks complete (internal account, SailPoint persona, Colleague File ID). Starter picks a Mac and peripherals, books induction, uploads a photo with sunglasses (rejected), then a clear photo (accepted, pass ordered).
6. LM adds a bespoke task, agrees Day 0 arrangements and check-ins.
7. Day 0: starter sees meeting point and floor plan, watches the exec video, collects equipment, sets 30-60-90 goals.
8. MI dashboard shows the intake funnel, a blocked starter with a "chase LM" nudge, and an exited starter in the exit report.

## 13. Open questions

Tracked with answers in `docs/DECISIONS.md`.
