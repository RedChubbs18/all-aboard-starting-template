import type { AdapterKey } from "@/domain/types";

export type { AdapterKey };

/** Normalised status snapshot every adapter can report for a journey. */
export interface AdapterStatus {
  status: string;
  updatedAt: string; // ISO
  detail?: string;
}

export interface BaseAdapter {
  readonly key: AdapterKey;
  /** Current integration status for a journey (feeds IntegrationState + engine). */
  getStatus(journeyId: string): Promise<AdapterStatus>;
}

/** Implemented by mocks only: lets the admin UI simulate external events (FR-AD.4). */
export interface Simulatable {
  /** Allowed raw statuses for simulation, e.g. First Advantage: not_started ... failed. */
  readonly simulatableStatuses: readonly string[];
  simulate(journeyId: string, status: string, detail?: string): Promise<AdapterStatus>;
}

/** Persistence used by mocks. Prisma-backed in the app, in-memory in tests. */
export interface StateStore {
  get<T = Record<string, unknown>>(journeyId: string, adapterKey: string): Promise<{ status: string; payload: T; updatedAt: Date } | null>;
  set<T = Record<string, unknown>>(journeyId: string, adapterKey: string, status: string, payload: T): Promise<void>;
}

/** journeyId used for adapter-wide (non per-journey) state. */
export const GLOBAL_JOURNEY = "GLOBAL";

export class AdapterNotConfiguredError extends Error {
  constructor(key: string) {
    super(`Adapter "${key}" is not configured for REAL mode`);
    this.name = "AdapterNotConfiguredError";
  }
}
