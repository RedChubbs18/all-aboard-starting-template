import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import type { StateStore } from "./types";

export const prismaStore: StateStore = {
  async get(journeyId, adapterKey) {
    const r = await prisma.integrationState.findUnique({ where: { journeyId_adapterKey: { journeyId, adapterKey } } });
    return r ? { status: r.status, payload: r.payload as never, updatedAt: r.updatedAt } : null;
  },
  async set(journeyId, adapterKey, status, payload) {
    const p = payload as unknown as Prisma.InputJsonValue;
    await prisma.integrationState.upsert({
      where: { journeyId_adapterKey: { journeyId, adapterKey } },
      create: { journeyId, adapterKey, status, payload: p },
      update: { status, payload: p },
    });
  },
};

export function memoryStore(): StateStore {
  const m = new Map<string, { status: string; payload: unknown; updatedAt: Date }>();
  return {
    async get(j, k) {
      const v = m.get(`${j}|${k}`);
      return v ? ({ ...v, payload: structuredClone(v.payload) } as never) : null;
    },
    async set(j, k, status, payload) {
      m.set(`${j}|${k}`, { status, payload: structuredClone(payload), updatedAt: new Date() });
    },
  };
}
