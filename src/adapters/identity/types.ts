import type { BaseAdapter } from "../types";

export type IdentityStatus = "none" | "invited" | "guest_active" | "internal_created";

/** FR-1.1, FR-3.1. The personal email is passed through and never stored. */
export interface IdentityAdapter extends BaseAdapter {
  key: "identity";
  /** Invite the starter as an Entra B2B guest with conditional access. */
  inviteGuest(journeyId: string, personalEmail: string): Promise<{ status: IdentityStatus; invitedAt: string }>;
  /** Create the internal account (pre-start conditional access). Returns the new UPN. */
  createInternalAccount(journeyId: string): Promise<{ status: IdentityStatus; upn: string }>;
}
