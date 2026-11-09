import type { BaseAdapter } from "../types";

export type SailPointStatus = "not_started" | "requested" | "applied" | "failed";

/** FR-3.2: pre-start account persona applied automatically. */
export interface SailPointAdapter extends BaseAdapter {
  key: "sailpoint";
  applyPersona(journeyId: string, persona?: string): Promise<{ status: SailPointStatus; persona: string }>;
}
