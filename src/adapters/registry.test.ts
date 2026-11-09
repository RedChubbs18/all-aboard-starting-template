import { describe, expect, it } from "vitest";
import { getAdapter, getAdapterMode, setAdapterMode } from "./registry";
import { prisma } from "@/server/db";

describe("registry", () => {
  it("defaults to MOCK and persists simulated state in IntegrationState across calls", async () => {
    expect(await getAdapterMode("firstadvantage")).toBe("MOCK");
    const a = (await getAdapter("firstadvantage")) as unknown as { simulate(j: string, s: string): Promise<unknown> };
    await a.simulate("reg-j1", "cleared");
    const b = await getAdapter("firstadvantage");
    expect((await b.getVettingStatus("reg-j1")).status).toBe("cleared");
    expect((await prisma.integrationState.findUnique({ where: { journeyId_adapterKey: { journeyId: "reg-j1", adapterKey: "firstadvantage" } } }))!.status).toBe("cleared");
  });

  it("REAL mode returns a stub that throws 'not configured'", async () => {
    await setAdapterMode("pass", "REAL");
    const real = await getAdapter("pass");
    expect(real.key).toBe("pass");
    expect(() => real.orderPass("j", { photoRef: "p", location: "l" })).toThrow(/not configured/);
    await setAdapterMode("pass", "MOCK");
  });

  it("env override wins over the database", async () => {
    process.env.ADAPTER_IDENTITY_MODE = "REAL";
    expect(await getAdapterMode("identity")).toBe("REAL");
    delete process.env.ADAPTER_IDENTITY_MODE;
  });
});
