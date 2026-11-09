import type { AdapterKey, AdapterStatus, Simulatable, StateStore } from "./types";

/** Shared mock behaviour: status read/write backed by the StateStore. */
export function statusMock(store: StateStore, key: AdapterKey, initial: string, allowed: readonly string[]) {
  const read = async <T = Record<string, unknown>>(journeyId: string) =>
    (await store.get<T>(journeyId, key)) ?? { status: initial, payload: {} as T, updatedAt: new Date(0) };
  const getStatus = async (journeyId: string): Promise<AdapterStatus> => {
    const s = await read<{ detail?: string }>(journeyId);
    return { status: s.status, updatedAt: s.updatedAt.toISOString(), detail: (s.payload as { detail?: string }).detail };
  };
  const write = async <T extends object>(journeyId: string, status: string, patch: T = {} as T) => {
    const cur = await read<Record<string, unknown>>(journeyId);
    await store.set(journeyId, key, status, { ...cur.payload, ...patch });
    return getStatus(journeyId);
  };
  const sim: Simulatable = {
    simulatableStatuses: allowed,
    async simulate(journeyId, status, detail) {
      if (!allowed.includes(status)) throw new Error(`${key}: unsupported status "${status}"`);
      return write(journeyId, status, detail ? { detail } : {});
    },
  };
  return { key, read, write, getStatus, ...sim };
}
