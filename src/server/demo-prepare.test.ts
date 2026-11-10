/**
 * The live demo's data, end to end through the services and DTO builders (no browser, nothing sent).
 * Uses the test database; the demo:prepare staging runs twice so the second run proves it is idempotent.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { buildDetail as lmDetail, buildSummaries } from "@/app/api/lm/_lib/detail";
import { buildTaskDetail } from "@/app/api/starter/_lib/detail";
import { buildJourneyDto } from "@/app/api/starter/_lib/dto";
import { parseRoles, type SessionUser } from "@/lib/auth/roles";
import { parseYouTubeId } from "@/lib/youtube";
import { prisma } from "./db";
import { ALEX_ID, ALEX_JOURNEY_ID, ALEX_MODEL, DANA_ID, DAY0_WHERE, OPEN_DAY0_KEYS, alexModelIsEntitled, prepareDemoData, summarise, type DemoSummary } from "./demo-prepare";
import { listJourneys, loadJourney, loadJourneyByStarter, settleForTime } from "./journey-service";
import { getOverview } from "./mi-service";
import { handleOfferAccepted } from "./workday-service";

const asSession = async (id: string): Promise<SessionUser> => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id } });
  return { id: u.id, displayName: u.displayName, upn: u.upn, roles: parseRoles(u.roles), teamId: u.teamId };
};

/** Removes everything a simulated Workday offer created (user, journey, tasks, events, idempotency rows). */
async function removeOffer(offerId: string, journeyId: string, starterId: string) {
  await prisma.$transaction([
    prisma.event.deleteMany({ where: { OR: [{ journeyId }, { entity: "User", entityId: starterId }] } }),
    prisma.integrationState.deleteMany({ where: { journeyId: { in: [journeyId, `WORKDAY-OFFER:${offerId}`] } } }),
    prisma.task.deleteMany({ where: { journeyId } }),
    prisma.journey.delete({ where: { id: journeyId } }),
    prisma.user.delete({ where: { id: starterId } }),
  ]);
}

let summary: DemoSummary;

beforeAll(async () => {
  await prepareDemoData();
  summary = await prepareDemoData(); // idempotent: a second run leaves the same picture
});

describe("demo staging", () => {
  it("Alex's catalogue entitlement still includes the staged laptop", () => {
    expect(alexModelIsEntitled()).toBe(true);
  });

  it("summarises Alex at Day 0 with today's start date and the open tasks", () => {
    expect(summary.alex.stage).toBe("DAY_0");
    expect(summary.alex.startDate).toBe(new Date().toISOString().slice(0, 10));
    expect(summary.alex.device).toBe(ALEX_MODEL);
    expect(summary.alex.openDay0Tasks.map((t) => t.key)).toEqual(expect.arrayContaining([...OPEN_DAY0_KEYS]));
  });

  it("never starts a guest conversion for Alex", async () => {
    // The identity row is the mock account (internal_created); a conversion would record converted / conversion_*.
    const identity = await prisma.integrationState.findUnique({ where: { journeyId_adapterKey: { journeyId: ALEX_JOURNEY_ID, adapterKey: "identity" } } });
    expect(identity?.status ?? "").not.toMatch(/^conver/);
    expect(await prisma.event.count({ where: { journeyId: ALEX_JOURNEY_ID, type: { startsWith: "GUEST_CONVERS" } } })).toBe(0);
  });

  it("(a) and (b) a simulated Workday offer for DWE lands with Dana, ready for buddy and Day 0", async () => {
    const offerId = "wd-offer-demoprep";
    const { journeyId, starterId } = await handleOfferAccepted(
      JSON.stringify({
        offerId, candidate: { firstName: "Demo", lastName: "Candidate" }, jobTitle: "Software Engineer", jobFamily: "ENGINEERING", teamKey: "dwe", lineManagerKey: DANA_ID,
        startDate: "2027-01-11", conditions: ["Satisfactory pre-employment vetting", "References"], guest: { objectId: null, inviteStatus: "simulated" },
      }),
    );
    try {
      // (a) CONDITIONAL_OFFER under Dana, with the engineering laptops only
      const j = (await loadJourney(journeyId))!;
      expect(j.currentStage).toBe("CONDITIONAL_OFFER");
      expect(j.lmId).toBe(DANA_ID);
      expect(j.teamId).toBe("dwe");
      const device = j.tasks.find((t) => t.key === "device-choice-submitted")!;
      const d = await buildTaskDetail(j, device);
      expect(d.detail.kind).toBe("order");
      const models = d.detail.kind === "order" ? d.detail.models.map((m) => m.label).sort() : [];
      expect(models).toEqual(["HP EliteBook U7", "MacBook Pro M5 Pro"]);

      // (b) Dana's list shows the new starter; buddy allocation and the Day 0 proposal are available
      const dana = await asSession(DANA_ID);
      const list = await buildSummaries(await listJourneys({ lmId: DANA_ID, status: "active" }));
      const row = list.find((s) => s.id === journeyId);
      expect(row?.starterName).toBe("Demo Candidate");
      expect(row?.stage).toBe("CONDITIONAL_OFFER");
      const detail = await lmDetail(journeyId, dana);
      expect(detail.buddy).toBeNull();
      expect(detail.buddyCandidates.map((c) => c.id)).toContain("kai-demo");
      expect(detail.day0).toBeNull();
      expect(detail.journey.status).toBe("active");
      expect(detail.tasks.find((t) => t.key === "allocate-buddy")?.canAct).toBe(true);
      expect(detail.tasks.some((t) => t.key === "propose-day-0-arrangements" && t.owner === "LM")).toBe(true);
      expect(summary.dana.starters).toBeGreaterThan(1);
    } finally {
      await removeOffer(offerId, journeyId, starterId);
    }
    expect(await loadJourneyByStarter(starterId)).toBeNull();
  });

  it("(c) Alex's starter view is Day 0 with the meeting point, floor plan, video, laptop and goals", async () => {
    const alex = await asSession(ALEX_ID);
    const j = await settleForTime((await loadJourneyByStarter(ALEX_ID))!);
    const dto = await buildJourneyDto(j, alex);
    expect(dto.currentStage).toBe("DAY_0");
    const task = (key: string) => {
      const t = dto.tasks.find((x) => x.key === key);
      expect(t, key).toBeDefined();
      return t!;
    };
    const state = j.tasks.find((t) => t.key === "find-your-way-on-day-one")!;

    // meeting point + floor plan
    const way = await buildTaskDetail(j, state);
    expect(way.detail.kind).toBe("day0");
    if (way.detail.kind === "day0") {
      expect(way.detail.day0?.where).toBe(DAY0_WHERE);
      expect(way.detail.day0?.confirmedAt).toBeTruthy();
    }
    expect(way.content?.body).toContain("/media/example-house-floor-3.svg");
    expect(way.content?.body).not.toContain("example.test/images");

    // Group Exec welcome video (YouTube), still open
    const videoState = j.tasks.find((t) => t.key === "watch-executive-welcome")!;
    const video = await buildTaskDetail(j, videoState);
    expect(video.detail.kind).toBe("video");
    expect(video.detail.kind === "video" && parseYouTubeId(video.detail.url)).toBeTruthy();
    expect(task("watch-executive-welcome").status).not.toBe("DONE");

    // collect equipment shows his chosen laptop
    const collect = await buildTaskDetail(j, j.tasks.find((t) => t.key === "collect-equipment")!);
    expect(collect.detail.kind).toBe("collect");
    expect(collect.detail.kind === "collect" && collect.detail.choice?.model).toBe("MacBook Pro M5 Pro");
    expect(task("collect-equipment").status).not.toBe("DONE");

    // goals unlocked, flex benefits open
    expect(task("draft-30-60-90-goals").status).not.toBe("LOCKED");
    expect(task("draft-30-60-90-goals").lockedReason).toBeNull();
    expect(task("review-flex-benefits").status).not.toBe("DONE");
  });

  it("(d) the MI overview has a major flag and a chase-able line manager", async () => {
    const o = await getOverview({});
    expect(o.lm.flags.length).toBeGreaterThanOrEqual(1);
    const chaseable = o.lm.league.filter((r) => r.canChase);
    expect(chaseable.length).toBeGreaterThanOrEqual(1);
    expect(chaseable.some((r) => r.flagCount > 0)).toBe(true);
    expect(o.kpis.majorFlags).toBe(o.lm.flags.length);
    expect(summary.mi.majorFlags).toBe(o.lm.flags.length);
    expect((await summarise()).alex.stage).toBe("DAY_0");
  });
});
