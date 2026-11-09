import type { BaseAdapter } from "../types";

export interface PassOrder {
  ref: string;
  location: string;
  /** Opaque reference to the uploaded photo (never the image itself). */
  photoRef: string;
  status: "ordered" | "printed" | "delivered" | "failed";
}

/** FR-3.11: photo ID pass ordered to the Day 0 location. */
export interface PassAdapter extends BaseAdapter {
  key: "pass";
  orderPass(journeyId: string, input: { photoRef: string; location: string }): Promise<PassOrder>;
  getOrder(journeyId: string): Promise<PassOrder | null>;
}
