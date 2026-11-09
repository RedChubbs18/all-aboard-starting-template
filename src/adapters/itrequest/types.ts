import type { BaseAdapter } from "../types";

export interface ITRequest {
  ref: string;
  item: string;
  status: "requested" | "fulfilled" | "failed";
  raisedAt: string;
}

/** FR-3.3, FR-3.5: IT@LBG requests (only raisable once the Colleague File ID exists; the engine enforces via dependsOn). */
export interface ITRequestAdapter extends BaseAdapter {
  key: "itrequest";
  raise(journeyId: string, item: string): Promise<ITRequest>;
  list(journeyId: string): Promise<ITRequest[]>;
}
