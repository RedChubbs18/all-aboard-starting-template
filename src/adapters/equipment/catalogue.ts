import { deviceTierFor, type DeviceTier } from "@/domain/job-family";

export interface DeviceModel {
  id: string;
  label: string;
  device: "MAC" | "WINDOWS";
  tier: DeviceTier;
}

/** D29: high spec for the Engineering job family, standard spec for everyone else. One Mac and one Windows model per tier. */
export const DEVICE_MODELS: DeviceModel[] = [
  { id: "mbp-m5-pro", label: "MacBook Pro M5 Pro", device: "MAC", tier: "HIGH" },
  { id: "hp-elitebook-u7", label: "HP EliteBook U7", device: "WINDOWS", tier: "HIGH" },
  { id: "mba-m5", label: "MacBook Air M5", device: "MAC", tier: "STANDARD" },
  { id: "hp-elitebook-u5", label: "HP EliteBook U5", device: "WINDOWS", tier: "STANDARD" },
];

/** The two models a starter may choose, from their job family (null or unknown = standard tier). */
export const entitledModels = (jobFamily: string | null | undefined): DeviceModel[] => {
  const tier = deviceTierFor(jobFamily);
  return DEVICE_MODELS.filter((m) => m.tier === tier);
};

export const findModel = (id: string): DeviceModel | undefined => DEVICE_MODELS.find((m) => m.id === id);
