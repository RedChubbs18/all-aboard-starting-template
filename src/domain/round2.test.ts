/**
 * Round-2 decisions against the REAL content/seed/templates.json: D30 classification, D31 stage timing, Q12 team
 * checklists, D32 "invited" rule, and the D29 device tier.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyIntegrationStatus,
  completeTask,
  createJourney,
  deviceTierFor,
  settle,
  stageIndex,
  vettingInvited,
  type JourneyState,
} from "./index";
import { peopleFileSchema, templatesFileSchema, toTemplateInput } from "./seed-schema";
import { needsCompletionPrompt } from "../components/journey/task-rules";

const read = (f: string) => JSON.parse(readFileSync(path.join(process.cwd(), "content/seed", f), "utf8"));
const templates = templatesFileSchema.parse(read("templates.json")).map(toTemplateInput);
const people = peopleFileSchema.parse(read("people.json"));
const byKey = new Map(templates.map((t) => [t.key, t]));

const created = new Date("2026-11-09T09:00:00Z");
const startDate = new Date("2027-01-11T00:00:00Z");
let n = 0;
const newId = () => `r2-${++n}`;
const make = (teamId = "no-such-team") => createJourney(templates, { starterId: "s", lmId: "lm", teamId, startDate, now: created, newId }).journey;
const task = (j: JourneyState, key: string) => j.tasks.find((t) => t.key === key)!;

/** Completes every gating/open task in stages before `before`, with the clock at `at`. */
function completeUpTo(j: JourneyState, before: "DAY_0" | "DAY_30", at: Date): JourneyState {
  let cur = j;
  for (let i = 0; i < 120; i++) {
    const t = cur.tasks.find((x) => x.applicable && stageIndex(x.stage) < stageIndex(before) && (x.status === "TODO" || x.status === "IN_PROGRESS" || x.status === "BLOCKED"));
    if (!t) break;
    cur = completeTask(cur, t.key, { now: at }).journey;
  }
  return cur;
}

describe("D30 classification of the real templates", () => {
  it("reading and info tasks auto-complete on open; tasks that need action or input never do", () => {
    for (const t of templates) {
      if (t.autoCompleteOnOpen) expect(["INFO"], `${t.key} auto-completes, so it must be a reading task`).toContain(t.type);
      if (["ACTION", "CHECKLIST", "TRAINING", "BOOKING", "ORDER"].includes(t.type)) expect(!!t.autoCompleteOnOpen, `${t.key} needs action`).toBe(false);
    }
  });

  it("flex benefits and development goals are action tasks that ask before completing", () => {
    for (const key of ["review-flex-benefits", "read-development-goals"]) {
      const t = byKey.get(key)!;
      expect(t.type).toBe("ACTION");
      expect(t.autoCompleteOnOpen).toBeFalsy();
      expect(needsCompletionPrompt({ type: t.type, key: t.key, autoCompleteOnOpen: t.autoCompleteOnOpen })).toBe(true);
    }
  });

  it("the pure reading tasks stay auto-complete and never prompt", () => {
    for (const key of ["read-contract-recap", "read-workspace-info", "meet-your-team", "read-policies-and-benefits", "read-check-in-guide", "read-performance-goals", "find-your-way-on-day-one"]) {
      const t = byKey.get(key)!;
      expect(t.autoCompleteOnOpen, key).toBe(true);
      expect(needsCompletionPrompt({ type: t.type, key: t.key, autoCompleteOnOpen: t.autoCompleteOnOpen })).toBe(false);
    }
  });

  it("flow-completed tasks (booking, order, photo, Day 0 confirmation) never double-prompt", () => {
    for (const key of ["book-induction", "book-induction-fallback", "device-choice-submitted", "choose-peripherals", "order-home-working-items", "upload-pass-photo", "confirm-day-0-arrangements"]) {
      const t = byKey.get(key)!;
      expect(needsCompletionPrompt({ type: t.type, key: t.key, autoCompleteOnOpen: t.autoCompleteOnOpen }), key).toBe(false);
    }
    // Plain actions, checklists and training do prompt.
    for (const key of ["say-hello-on-teams", "ms-password-authenticator-setup", "view-mandatory-training", "mandatory-training-checklist", "draft-30-60-90-goals", "collect-equipment"]) {
      const t = byKey.get(key)!;
      expect(needsCompletionPrompt({ type: t.type, key: t.key, autoCompleteOnOpen: t.autoCompleteOnOpen }), key).toBe(true);
    }
  });
});

describe("Q12 team-specific checklists", () => {
  const teamKeys = (j: JourneyState) => j.tasks.filter((t) => t.source === "TEAM").map((t) => t.key).sort();

  it("Cloud Platform Engineering starters get the GCP and on-call tasks, and nothing from DWE", () => {
    expect(teamKeys(make("cpe"))).toEqual(["team-cloud-oncall-briefing", "team-gcp-fundamentals-training", "team-gcp-project-access"]);
  });
  it("DWE starters keep the DWE checklist and see nothing from the cloud team", () => {
    expect(teamKeys(make("dwe"))).toEqual(["team-azure-devops-access", "team-distribution-lists", "team-github-access", "team-recurring-calls-list", "team-welcome-message"]);
  });
  it("starters on other teams see no team tasks", () => {
    for (const team of ["cia", "ops"]) expect(teamKeys(make(team)), team).toEqual([]);
  });
  it("the cloud team is seeded with an LM, members and starters, with UPN-compatible keys", () => {
    const team = people.teams.find((t) => t.key === "cpe")!;
    expect(team).toMatchObject({ name: "Cloud Platform Engineering", businessArea: "Group Technology", lmKey: "sofia-marlow" });
    const members = people.users.filter((u) => u.teamKey === "cpe");
    expect(members.filter((u) => u.roles.includes("STARTER")).length).toBeGreaterThanOrEqual(1);
    expect(members.filter((u) => u.roles.includes("BUDDY")).length).toBeGreaterThanOrEqual(2);
    for (const u of members) expect(`team05-${u.key}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/); // matches scripts/map-entra-users.mjs
  });
});

describe("D31 stage timing with the real templates", () => {
  it("Day 0 stays closed until the start date even when every earlier task is done", () => {
    const early = new Date("2026-12-01T09:00:00Z"); // five weeks before the start date
    const j = completeUpTo(make(), "DAY_0", early);
    expect(j.currentStage).toBe("UNCONDITIONAL_OFFER");
    for (const t of j.tasks.filter((x) => x.stage === "DAY_0" && x.applicable)) expect(t.status, t.key).toBe("LOCKED");
    expect(settle(j, { now: new Date("2027-01-10T23:59:00Z") }).journey.currentStage).toBe("UNCONDITIONAL_OFFER");
    expect(settle(j, { now: startDate }).journey.currentStage).toBe("DAY_0");
  });

  it("Day 30 opens no earlier than start + 30 days, and the goals lock (D21) opens with Day 0", () => {
    const j0 = settle(completeUpTo(make(), "DAY_0", new Date("2026-12-01T09:00:00Z")), { now: startDate }).journey;
    const j = completeUpTo(j0, "DAY_30", startDate);
    expect(j.currentStage).toBe("DAY_0");
    expect(settle(j, { now: new Date("2027-02-09T23:00:00Z") }).journey.currentStage).toBe("DAY_0"); // day 29
    expect(settle(j, { now: new Date("2027-02-10T00:00:00Z") }).journey.currentStage).toBe("DAY_30"); // start + 30 days
  });
});

describe("D32 vetting invitation", () => {
  it("vettingInvited needs both reaching PEV and a First Advantage status past not started", () => {
    const j = make();
    expect(vettingInvited(j, "in_progress")).toBe(false); // vetting tasks still locked
    const atPev = completeTask(completeTask(j, "guest-invite-sent", { now: created }).journey, "guest-sign-in", { now: created }).journey;
    const open = completeUpTo(atPev, "DAY_0", created); // far enough: PEV tasks unlocked at some point
    expect(open.tasks.some((t) => t.adapterKey === "firstadvantage" && t.status !== "LOCKED")).toBe(true);
    for (const s of [undefined, null, "", "not_started"]) expect(vettingInvited(open, s)).toBe(false);
    for (const s of ["in_progress", "action_needed", "cleared", "failed"]) expect(vettingInvited(open, s)).toBe(true);
  });

  it("an action_needed or failed signal before PEV leaves the journey unflagged (the service replays it on reaching PEV)", () => {
    const j = make();
    for (const s of ["action_needed", "failed"]) {
      const r = applyIntegrationStatus(j, "firstadvantage", s, { now: created }).journey;
      expect(r.flagged).toBe(false);
      expect(task(r, "complete-vetting-steps").status).toBe("LOCKED");
    }
  });
});

describe("D29 tiers", () => {
  it("engineering is high spec, everything else (and unknown) is standard", () => {
    expect(deviceTierFor("ENGINEERING")).toBe("HIGH");
    for (const f of ["DATA_AND_ANALYTICS", "OPERATIONS", "CUSTOMER_SERVICE", "RISK_AND_COMPLIANCE", "CORPORATE_FUNCTIONS", null, undefined, "??"]) expect(deviceTierFor(f)).toBe("STANDARD");
  });
  it("every seeded user has a job family, and engineers on the seeded teams are ENGINEERING", () => {
    expect(people.users.every((u) => !!u.jobFamily)).toBe(true);
    expect(people.users.find((u) => u.key === "alex-morgan")!.jobFamily).toBe("ENGINEERING");
    expect(people.users.find((u) => u.key === "nadia-brooks")!.jobFamily).not.toBe("ENGINEERING");
    expect(new Set(people.users.filter((u) => u.roles.includes("STARTER")).map((u) => u.jobFamily)).size).toBeGreaterThan(3);
  });
});
