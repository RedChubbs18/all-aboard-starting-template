import type { BaseAdapter } from "../types";

export interface ITRequest {
  ref: string;
  item: string;
  status: "requested" | "fulfilled" | "failed";
  raisedAt: string;
}

/** Thrown by `raise` until the Colleague File ID exists (FR-3.3). Route handlers should map it to HTTP 409. */
export class ColleagueFileIdMissingError extends Error {
  readonly code = "COLLEAGUE_FILE_ID_MISSING";
  constructor() {
    super("IT requests can only be raised once your Colleague File ID exists.");
    this.name = "ColleagueFileIdMissingError";
  }
}

/** FR-3.3, FR-3.5: IT@LBG requests. The adapter itself refuses to raise one before the Colleague File ID exists. */
export interface ITRequestAdapter extends BaseAdapter {
  key: "itrequest";
  /** @throws ColleagueFileIdMissingError until the Colleague File ID exists. */
  raise(journeyId: string, item: string): Promise<ITRequest>;
  list(journeyId: string): Promise<ITRequest[]>;
  /** Additive: whether requests can be raised yet. */
  canRaise(journeyId: string): Promise<{ allowed: boolean; reason?: string }>;
}
