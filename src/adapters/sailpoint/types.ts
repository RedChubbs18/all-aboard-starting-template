import type { BaseAdapter } from "../types";

export type SailPointStatus = "not_started" | "requested" | "applied" | "failed" | "file_id_created";

/** FR-3.2: pre-start account persona applied automatically. FR-3.3: SailPoint (IAM) also generates the Colleague File ID. */
export interface SailPointAdapter extends BaseAdapter {
  key: "sailpoint";
  applyPersona(journeyId: string, persona?: string): Promise<{ status: SailPointStatus; persona: string }>;
  /** Additive: the persona applied, if any. */
  getPersona(journeyId: string): Promise<string | null>;
  /** Additive. Generates the Colleague File ID (synthetic `CF-xxxxxx`). Idempotent. Unlocks IT@LBG requests. */
  createColleagueFileId(journeyId: string): Promise<{ id: string; createdAt: string }>;
  /** Additive. Null until the Colleague File ID exists. */
  getColleagueFileId(journeyId: string): Promise<{ id: string; createdAt: string } | null>;
}
