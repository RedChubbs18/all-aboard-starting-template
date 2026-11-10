import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueue = vi.hoisted(() => vi.fn());
vi.mock("./conversion-hook", () => ({ enqueueConversion: enqueue }));

import { prisma } from "./db";
import { seedDatabase } from "./seed";
import * as js from "./journey-service";
import { simulate, runDemoStep } from "./integration-service";

const ALEX = "journey-alex-morgan";

beforeEach(async () => {
  enqueue.mockClear();
  await seedDatabase(prisma);
});

describe("conversion hook (real templates)", () => {
  it("does not fire before UNCONDITIONAL_OFFER, then fires once when the journey reaches it", async () => {
    await simulate("firstadvantage", ALEX, "cleared");
    expect(enqueue).not.toHaveBeenCalled();
    await runDemoStep("offer_conditions_met", {}, ALEX);
    expect((await js.loadJourney(ALEX))!.currentStage).toBe("UNCONDITIONAL_OFFER");
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(ALEX);
  });

  it("a throwing enqueue never breaks the stage change contract (enqueue itself swallows errors)", async () => {
    const { enqueueConversion } = await vi.importActual<typeof import("./conversion-hook")>("./conversion-hook");
    expect(() => enqueueConversion("whatever")).not.toThrow();
  });
});
