import type { BaseAdapter } from "../types";

export type CollectionPoint = "TECH_BAR" | "MAILROOM";

export interface EquipmentChoice {
  device: "MAC" | "WINDOWS";
  peripherals: string[];
  collectionPoint: string;
  ref: string;
}

export interface CatalogueItem {
  id: string;
  label: string;
}

export interface EquipmentCatalogue {
  devices: (CatalogueItem & { device: "MAC" | "WINDOWS" })[];
  peripherals: CatalogueItem[];
  homeWorking: CatalogueItem[];
  collectionPoints: (CatalogueItem & { id: CollectionPoint })[];
}

export interface HomeWorkingOrder {
  ref: string;
  items: string[];
  status: "ordered";
  orderedAt: string;
}

/** FR-3.7, FR-4.1, FR-4.8. */
export interface EquipmentAdapter extends BaseAdapter {
  key: "equipment";
  submitChoice(
    journeyId: string,
    choice: { device: "MAC" | "WINDOWS"; peripherals: string[]; collectionPoint?: CollectionPoint },
  ): Promise<EquipmentChoice>;
  getChoice(journeyId: string): Promise<EquipmentChoice | null>;
  /** Additive. Catalogue of devices, Day 0 peripherals, home-working items and collection points. */
  getCatalogue(): Promise<EquipmentCatalogue>;
  /** Additive. FR-4.1: order desk, monitor and other home-working items. */
  orderHomeWorking(journeyId: string, itemIds: string[]): Promise<HomeWorkingOrder>;
  getHomeWorkingOrder(journeyId: string): Promise<HomeWorkingOrder | null>;
}
