import type { BaseAdapter } from "../types";

export interface EquipmentChoice {
  device: "MAC" | "WINDOWS";
  peripherals: string[];
  collectionPoint: string;
  ref: string;
}

/** FR-3.7, FR-4.1, FR-4.8. */
export interface EquipmentAdapter extends BaseAdapter {
  key: "equipment";
  submitChoice(journeyId: string, choice: { device: "MAC" | "WINDOWS"; peripherals: string[] }): Promise<EquipmentChoice>;
  getChoice(journeyId: string): Promise<EquipmentChoice | null>;
}
