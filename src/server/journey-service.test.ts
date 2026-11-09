import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./db";
import * as svc from "./journey-service";
import { TEMPLATES } from "@/domain/test-fixtures";

const P = "svc-";

beforeAll(async () => {
  await prisma.taskTemplate.deleteMany(); // other test files (seed) may have loaded real templates
  await prisma.team.create({ data: { id: `${P}team-a`, name: "Team A" } });
  for (const [id, roles, extra] of [
    ["lm", ["LM"], {}],
    ["buddy", ["BUDDY"], { buddyEligible: true }],
    ["starter", ["STARTER"], {}],
    ["starter2", ["STARTER"], {}],
  ] as const) {
    await prisma.user.create({ data: { id: `${P}${id}`, upn: `${P}${id}@example.test`, displayName: id, roles: [...roles], teamId: `${P}team-a`, ...extra } });
  }
  for (const t of TEMPLATES.filter((t) => t.source === "CORE")) {
    await prisma.taskTemplate.create({ data: { ...t, key: `${P}${t.key}`, dependsOn: t.dependsOn.map((d) => `${P}${d}`), condition: t.condition ? t.condition.replace(":", `:${P}`) : null, adapterKey: t.adapterKey ?? null } });
  }
});

const input = (starter: string) => ({ starterId: `${P}${starter}`, lmId: `${P}lm`, teamId: `${P}team-a`, startDate: new Date("2026-12-01T00:00:00Z"), actorId: `${P}lm` });

describe("journey-service", () => {
  it("creates a journey with tasks and a JOURNEY_CREATED event", async () => {
    const j = await svc.createJourneyForStarter(input("starter"));
    const loaded = await svc.loadJourney(j.id);
    expect(loaded!.tasks.length).toBeGreaterThan(5);
    expect(loaded!.tasks.find((t) => t.key === `${P}intro`)!.status).toBe("TODO");
    const events = await svc.listEvents(j.id);
    expect(events[0].type).toBe("JOURNEY_CREATED");
  });

  it("persists task changes, stage moves and events in one go", async () => {
    const j = await svc.createJourneyForStarter(input("starter2"));
    const after = await svc.completeTask(j.id, `${P}intro`, { actorId: `${P}starter2` });
    expect(after.currentStage).toBe("PEV");
    const reloaded = await svc.loadJourney(j.id);
    expect(reloaded!.currentStage).toBe("PEV");
    const events = await svc.listEvents(j.id);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["TASK_STATUS_CHANGED", "STAGE_CHANGED"]));

    const flagged = await svc.applyIntegrationStatus(j.id, "firstadvantage", "action_needed");
    expect(flagged.flagged).toBe(true);
    expect((await prisma.journey.findUnique({ where: { id: j.id } }))!.flagged).toBe(true);
    const state = await prisma.integrationState.findUnique({ where: { journeyId_adapterKey: { journeyId: j.id, adapterKey: "firstadvantage" } } });
    expect(state!.status).toBe("action_needed");

    const cleared = await svc.applyIntegrationStatus(j.id, "firstadvantage", "cleared");
    expect(cleared.currentStage).toBe("PEV"); // D10: cleared alone does not advance the stage
    const advanced = await svc.completeTask(j.id, `${P}offer-conditions`, { actorId: `${P}lm` });
    expect(advanced.currentStage).toBe("UNCONDITIONAL_OFFER");
  });

  it("rolls back when the engine throws", async () => {
    const j = await svc.createJourneyForStarter({ ...input("starter"), starterId: `${P}lm` });
    await expect(svc.completeTask(j.id, `${P}contract`)).rejects.toThrow();
    const events = await svc.listEvents(j.id);
    expect(events).toHaveLength(1);
  });

  it("validates buddy allocation", async () => {
    const j = await svc.createJourneyForStarter({ ...input("starter"), starterId: `${P}buddy` });
    await expect(svc.allocateBuddy(j.id, `${P}lm`, null)).rejects.toThrow(/line manager/);
    await expect(svc.allocateBuddy(j.id, `${P}starter`, null)).rejects.toThrow(/buddy-eligible/);
    await expect(svc.allocateBuddy(j.id, `${P}buddy`, `${P}lm`)).rejects.toThrow(/starter/); // buddy is the starter here
  });
});
