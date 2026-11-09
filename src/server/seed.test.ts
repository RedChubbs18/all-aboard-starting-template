import { describe, expect, it } from "vitest";
import { prisma } from "./db";
import { seedDatabase } from "./seed";
import { loadJourney } from "./journey-service";

describe("seed", () => {
  it("loads content/seed (or fixtures) and produces consistent journeys", async () => {
    const r = await seedDatabase(prisma);
    expect(r.journeys).toBeGreaterThanOrEqual(3);
    expect(await prisma.user.count({ where: { upn: { endsWith: "@example.test" } } })).toBe(r.users);
    const journeys = await prisma.journey.findMany();
    expect(new Set(journeys.map((j) => j.currentStage)).size).toBeGreaterThanOrEqual(3);
    for (const j of journeys) {
      const state = (await loadJourney(j.id))!;
      expect(state.tasks.length).toBeGreaterThan(0);
      // Seeded statuses must agree with a fresh recompute (no stale LOCKED/TODO).
      const { recomputeTasks } = await import("@/domain/engine");
      expect(recomputeTasks(state).events).toHaveLength(0);
    }
    expect(await prisma.event.count()).toBeGreaterThan(0);
  });

  it("is repeatable", async () => {
    await seedDatabase(prisma);
    const a = await prisma.journey.count();
    await seedDatabase(prisma);
    expect(await prisma.journey.count()).toBe(a);
  });
});
