/**
 * Review-finding regressions against the REAL seeded content (content/seed/templates.json via seedDatabase):
 * one overdue definition, Jump to Day 0 timing, reset behaviour, photo-check override, MI intake "Behind".
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./db";
import { seedDatabase } from "./seed";
import * as js from "./journey-service";
import { getIssues, getOverview } from "./mi-service";
import { orderPassAfterRecertification, resetDemoStarter, runDemoStep } from "./integration-service";
import { handleOfferAccepted } from "./workday-service";
import { buildIntake, type JourneyMeta } from "./mi-metrics";
import { isOverdue } from "@/domain/engine";
import { STAGES, type JourneyState } from "@/domain/types";
import { DEMO_COOKIE, signDemoSession } from "@/lib/auth/server";
import type { StarterSummary } from "@/components/lm/types";
import { GET as lmList } from "@/app/api/lm/starters/route";

const ALEX = "journey-alex-morgan";
const DAY = 86_400_000;
const loadAlex = async () => (await js.loadJourney(ALEX))!;
const taskOf = (j: JourneyState, key: string) => j.tasks.find((t) => t.key === key)!;

beforeAll(() => {
  process.env.AUTH_MODE = "demo";
});
afterAll(() => {
  process.env.AUTH_MODE = "";
});
beforeEach(async () => {
  await seedDatabase(prisma);
});

/** Same metric the league uses: LM tasks done by their due timestamp, over done-or-overdue LM tasks. */
const lmDoneLate = (journeys: JourneyState[], lmId: string) =>
  journeys.filter((j) => j.lmId === lmId).flatMap((j) => j.tasks).filter((t) => t.owner === "LM" && t.applicable && !t.optional && t.status === "DONE" && t.completedAt && t.completedAt.getTime() > t.dueDate.getTime()).length;

describe("item 2: one overdue definition (UTC day compare)", () => {
  it("a task is not overdue on its due day, overdue the day after", async () => {
    const j = await loadAlex();
    const t = { ...taskOf(j, "propose-day-0-arrangements"), status: "TODO" as const, applicable: true, dueDate: new Date("2026-11-10T00:00:00Z") };
    expect(isOverdue(t, new Date("2026-11-10T23:59:00Z"))).toBe(false);
    expect(isOverdue(t, new Date("2026-11-11T00:01:00Z"))).toBe(true);
  });

  it("right after Jump to Day 0, Alex has no overdue Day 0 tasks in progress(), the LM list or MI", async () => {
    await runDemoStep("jump_day0", {}, ALEX);
    const j = await loadAlex();
    expect(j.currentStage).toBe("DAY_0");
    const day0Keys = j.tasks.filter((t) => t.stage === "DAY_0").map((t) => t.key);
    expect(day0Keys.length).toBeGreaterThan(0);

    const p = js.computeProgress(j, new Date());
    expect(p.overdue.filter((t) => day0Keys.includes(t.key))).toEqual([]);

    const cookie = `${DEMO_COOKIE}=${await signDemoSession("dana-sample")}`;
    const res = await lmList(new Request("http://localhost/api/lm/starters", { headers: { cookie } }), undefined as never);
    const alex = ((await res.json()) as { starters: StarterSummary[] }).starters.find((s) => s.id === ALEX)!;
    expect(alex.overdue).toBe(p.overdue.length);
    expect(alex.overdueLm).toBe(p.overdue.filter((t) => t.owner === "LM").length);

    const issues = (await getIssues({})).filter((i) => i.journeyId === ALEX && i.kind === "OVERDUE");
    expect(issues.filter((i) => day0Keys.includes(i.taskKey))).toEqual([]);
    const overview = await getOverview({});
    const dana = overview.lm.league.find((r) => r.lmId === "dana-sample")!;
    expect(dana.overdueItems.filter((i) => i.journeyId === ALEX && day0Keys.includes(i.taskKey))).toEqual([]);
  });
});

describe("item 4: Jump to Day 0 does not record completions as late", () => {
  it("leaves the LM on-time record unchanged, still reaches DAY_0, and adds no late completions", async () => {
    const lateBefore = lmDoneLate(await js.listJourneys(), "dana-sample");
    const dueBefore = new Map((await loadAlex()).tasks.map((t) => [t.key, t.dueDate.getTime()]));
    await prisma.journey.update({ where: { id: ALEX }, data: { startDate: new Date(Date.now() + 30 * DAY) } });
    await runDemoStep("jump_day0", {}, ALEX);
    const j = await loadAlex();
    expect(j.currentStage).toBe("DAY_0");
    expect(lmDoneLate(await js.listJourneys(), "dana-sample")).toBe(lateBefore);
    // Anything late now was already past due before the jump (seeded early tasks); the move itself adds none.
    const lateAlex = j.tasks.filter((t) => t.status === "DONE" && t.completedAt && t.completedAt.getTime() > t.dueDate.getTime());
    for (const t of lateAlex) expect(dueBefore.get(t.key)!, t.key).toBeLessThan(Date.now());
    const done = j.tasks.filter((t) => t.status === "DONE" && t.stage !== "DAY_0" && t.completedAt && t.completedAt.getTime() > Date.now() - 60_000);
    expect(done.length).toBeGreaterThan(0);
  });
});

describe("items 5 and 8: reset", () => {
  const offer = () =>
    handleOfferAccepted(
      JSON.stringify({
        offerId: "wd-offer-review", candidate: { firstName: "Jo", lastName: "Bloggs" }, jobTitle: "Engineer", jobFamily: "ENGINEERING", teamKey: "dwe", lineManagerKey: "dana-sample",
        startDate: "2027-01-11", conditions: [], guest: { objectId: "8d5f1c1e-5b0a-4c53-9a53-0b6a4f3c2d11", inviteStatus: "invited" },
      }),
    );

  it("does not complete allocate-buddy when the journey has no buddy, but does when it has one", async () => {
    const { journeyId } = await offer();
    expect((await js.loadJourney(journeyId))!.buddyId).toBeNull();
    await resetDemoStarter(journeyId);
    expect(taskOf((await js.loadJourney(journeyId))!, "allocate-buddy").status).not.toBe("DONE");
    expect(taskOf((await js.loadJourney(journeyId))!, "guest-invite-sent").status).toBe("DONE");
    // Alex has a buddy, so the seeded early task stays done.
    expect((await loadAlex()).buddyId).toBeTruthy();
    await resetDemoStarter(ALEX);
    expect(taskOf(await loadAlex(), "allocate-buddy").status).toBe("DONE");
  });

  it("keeps a JOURNEY_CREATED event so the funnel's first stage still counts the journey", async () => {
    await runDemoStep("jump_day0", {}, ALEX);
    await resetDemoStarter(ALEX);
    const created = await prisma.event.findMany({ where: { journeyId: ALEX, type: "JOURNEY_CREATED" } });
    expect(created).toHaveLength(1);
    const funnel = (await getOverview({})).funnel;
    expect(funnel[0].stage).toBe(STAGES[0]);
    const row = funnel[0] as unknown as Record<string, number>;
    expect(row.reached).toBeGreaterThan(0);
    const { journeyId } = await offer();
    await resetDemoStarter(journeyId);
    expect(await prisma.event.count({ where: { journeyId, type: "JOURNEY_CREATED" } })).toBe(1);
  });
});

describe("item 6: photo-check-override is not blocked by repeat review requests", () => {
  it("two review requests leave the override actionable, and recertifying orders the pass", async () => {
    for (const key of ["guest-sign-in", "device-choice-submitted"]) await js.completeTask(ALEX, key, { actorId: "test" });
    for (let i = 0; i < 80 && (await loadAlex()).currentStage !== "UNCONDITIONAL_OFFER"; i++) {
      const t = (await loadAlex()).tasks.find((x) => x.applicable && x.stage !== "UNCONDITIONAL_OFFER" && x.stage !== "DAY_0" && x.stage !== "DAY_30" && ["TODO", "IN_PROGRESS", "BLOCKED"].includes(x.status));
      if (!t) break;
      await js.completeTask(ALEX, t.key, { actorId: "test" });
    }
    expect((await loadAlex()).currentStage).toBe("UNCONDITIONAL_OFFER");
    await js.proposeDay0(ALEX, { where: "Example Office, Floor 3 reception", whenAt: new Date("2026-12-07T09:00:00Z"), who: "Dana" }, "dana-sample");
    await js.confirmDay0(ALEX, "alex-morgan");
    await js.completeTask(ALEX, "confirm-day-0-arrangements", { actorId: "alex-morgan" });

    await js.requestPhotoReview(ALEX, { actorId: "alex-morgan", detail: "first" });
    await js.requestPhotoReview(ALEX, { actorId: "alex-morgan", detail: "second" });
    const j = await loadAlex();
    expect(taskOf(j, "photo-check-override").adapterKey).toBeNull();
    expect(taskOf(j, "photo-check-override").status).toBe("TODO");

    await js.completeTask(ALEX, "photo-check-override", { actorId: "dana-sample" });
    expect(taskOf(await loadAlex(), "order-photo-id-pass").status).toBe("TODO");
    expect(await orderPassAfterRecertification(ALEX, { actorId: "dana-sample" })).toBe(true);
    const after = await loadAlex();
    expect(taskOf(after, "order-photo-id-pass").status).toBe("DONE");
    expect(after.flagged).toBe(false);
  });
});

describe("item 9: MI intake Behind includes LM overdue and HIGH early warning", () => {
  const NOW = new Date("2026-11-10T12:00:00Z");
  const task = (key: string, o: Partial<JourneyState["tasks"][number]> = {}): JourneyState["tasks"][number] => ({
    id: key, key, templateId: null, title: key, description: "", stage: "UNCONDITIONAL_OFFER" as const, owner: "LM" as const, type: "ACTION" as const, status: "TODO" as const,
    dueDate: new Date(NOW.getTime() - 3 * DAY), completedAt: null, blockedReason: null, evidence: null, dependsOn: [], source: "CORE" as const, adapterKey: null,
    gating: false, contentSlug: null, condition: null, applicable: true, sortOrder: 0, ...o,
  });
  const gating = (key: string) => task(key, { owner: "STARTER", gating: true, status: "DONE", completedAt: NOW, dueDate: new Date(NOW.getTime() + DAY) });
  const mk = (id: string, daysToStart: number, tasks: JourneyState["tasks"]): JourneyState => ({
    id, starterId: `s-${id}`, lmId: "lm", buddyId: null, teamId: "t", startDate: new Date(NOW.getTime() + daysToStart * DAY), currentStage: "UNCONDITIONAL_OFFER", status: "active",
    exitReason: null, exitStage: null, completedAt: null, flagged: false, flagReason: null, tasks,
  });
  const meta = (...ids: string[]) => new Map<string, JourneyMeta>(ids.map((id) => [id, { teamId: "t", teamName: "T", area: null, createdAt: NOW }]));
  const names = new Map([["lm", "LM"]]);

  it("a starter starting tomorrow with 5 overdue LM actions is Behind even at 88% readiness, with the reason shown", () => {
    const lm = ["a", "b", "c", "d", "e"].map((k) => task(`lm-${k}`));
    const gates = [...Array.from({ length: 7 }, (_, i) => gating(`g${i}`)), task("g-open", { owner: "STARTER", gating: true })]; // 7 of 8 = 88%
    const j = mk("x", 1, [...gates, ...lm]);
    const out = buildIntake([j], names, meta("x"), NOW);
    expect(out.starters[0]).toMatchObject({ readinessPct: 88, behind: true });
    expect(out.starters[0].behindReasons.join(" ")).toMatch(/5 overdue LM actions/);
    expect(out.weeks[0].behind).toBe(1);
  });

  it("an overdue LM action does not make a starter far from their start Behind, and a clean starter is On track", () => {
    const far = mk("f", 40, [gating("g"), task("lm-1")]);
    const clean = mk("c", 3, [gating("g"), task("lm-ok", { dueDate: new Date(NOW.getTime() + 2 * DAY) })]);
    const out = buildIntake([far, clean], names, meta("f", "c"), NOW);
    expect(out.starters.map((s) => [s.journeyId, s.behind, s.behindReasons])).toEqual([["c", false, []], ["f", false, []]]);
  });

  it("a HIGH early-warning row makes the starter Behind whatever the start date, a WATCH row does not", () => {
    const j = mk("h", 40, [gating("g")]);
    const row = (level: "HIGH" | "WATCH") => ({ journeyId: "h", starterName: "S", teamName: "T", lmName: "LM", stage: j.currentStage, startDate: j.startDate.toISOString(), daysToStart: 40, signals: [{ kind: "STARTER_QUIET" as const, detail: "Nothing done for 20 days" }], level });
    expect(buildIntake([j], names, meta("h"), NOW, 13, [row("HIGH")]).starters[0].behindReasons).toEqual(["Early warning HIGH: Nothing done for 20 days"]);
    expect(buildIntake([j], names, meta("h"), NOW, 13, [row("WATCH")]).starters[0].behind).toBe(false);
  });
});
