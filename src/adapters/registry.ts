import { prisma } from "@/server/db";
import { ADAPTER_KEYS } from "@/domain/types";
import { createBookingMock } from "./booking/mock";
import { createChatbotMock } from "./chatbot/mock";
import { createEquipmentMock } from "./equipment/mock";
import { createHireViewMock } from "./hireview/mock";
import { createIdentityMock } from "./identity/mock";
import { createITRequestMock } from "./itrequest/mock";
import { createNotificationMock } from "./notification/mock";
import { createPassMock } from "./pass/mock";
import { createPhotoCheckMock } from "./photocheck/mock";
import { createSailPointMock } from "./sailpoint/mock";
import { createWorkdayMock } from "./workday/mock";
import { realStub } from "./real-stub";
import { prismaStore } from "./store";
import type { AdapterKey, Simulatable, StateStore } from "./types";
import type { BookingAdapter } from "./booking/types";
import type { ChatbotAdapter } from "./chatbot/types";
import type { EquipmentAdapter } from "./equipment/types";
import type { HireViewAdapter } from "./hireview/types";
import type { IdentityAdapter } from "./identity/types";
import type { ITRequestAdapter } from "./itrequest/types";
import type { NotificationAdapter } from "./notification/types";
import type { PassAdapter } from "./pass/types";
import type { PhotoCheckAdapter } from "./photocheck/types";
import type { SailPointAdapter } from "./sailpoint/types";
import type { WorkdayAdapter } from "./workday/types";

export type AdapterMode = "MOCK" | "REAL";

export interface AdapterMap {
  identity: IdentityAdapter;
  sailpoint: SailPointAdapter;
  hireview: HireViewAdapter;
  workday: WorkdayAdapter;
  itrequest: ITRequestAdapter;
  equipment: EquipmentAdapter;
  pass: PassAdapter;
  booking: BookingAdapter;
  photocheck: PhotoCheckAdapter;
  chatbot: ChatbotAdapter;
  notification: NotificationAdapter;
}

export const mockFactories: { [K in AdapterKey]: (store: StateStore) => AdapterMap[K] } = {
  identity: createIdentityMock,
  sailpoint: createSailPointMock,
  hireview: createHireViewMock,
  workday: createWorkdayMock,
  itrequest: createITRequestMock,
  equipment: createEquipmentMock,
  pass: createPassMock,
  booking: createBookingMock,
  photocheck: createPhotoCheckMock,
  chatbot: createChatbotMock,
  notification: createNotificationMock,
};

/**
 * Real implementations. Register them here when they exist; until then REAL
 * resolves to a stub that throws "not configured".
 */
export const realFactories: Partial<{ [K in AdapterKey]: () => AdapterMap[K] }> = {};

/** `ADAPTER_<KEY>_MODE` env wins, then the AdapterConfig row, then MOCK. */
export async function getAdapterMode(key: AdapterKey): Promise<AdapterMode> {
  const env = process.env[`ADAPTER_${key.toUpperCase()}_MODE`]?.toUpperCase();
  if (env === "MOCK" || env === "REAL") return env;
  const row = await prisma.adapterConfig.findUnique({ where: { adapterKey: key } });
  return row?.mode === "REAL" ? "REAL" : "MOCK";
}

export async function setAdapterMode(key: AdapterKey, mode: AdapterMode): Promise<void> {
  await prisma.adapterConfig.upsert({ where: { adapterKey: key }, create: { adapterKey: key, mode }, update: { mode } });
}

export async function listAdapterModes(): Promise<{ key: AdapterKey; mode: AdapterMode; envOverride: boolean }[]> {
  const rows = await prisma.adapterConfig.findMany();
  return ADAPTER_KEYS.map((key) => {
    const env = process.env[`ADAPTER_${key.toUpperCase()}_MODE`];
    const row = rows.find((r) => r.adapterKey === key);
    const mode = (env?.toUpperCase() === "REAL" || env?.toUpperCase() === "MOCK" ? env.toUpperCase() : row?.mode) === "REAL" ? "REAL" : "MOCK";
    return { key, mode, envOverride: !!env };
  });
}

export async function getAdapter<K extends AdapterKey>(key: K): Promise<AdapterMap[K]> {
  const mode = await getAdapterMode(key);
  if (mode === "REAL") {
    const real = realFactories[key] as (() => AdapterMap[K]) | undefined;
    return real ? real() : realStub<AdapterMap[K]>(key);
  }
  return mockFactories[key](prismaStore) as AdapterMap[K];
}

export function isSimulatable<T extends object>(a: T): a is T & Simulatable {
  return typeof (a as Partial<Simulatable>).simulate === "function";
}
