import type { BaseAdapter } from "../types";

export type IdentityStatus = "none" | "invited" | "guest_active" | "internal_created";

export interface IdentityAccount {
  status: IdentityStatus;
  invitedAt: string | null;
  /** Work UPN, only once the internal account exists. */
  upn: string | null;
  /** Guests are restricted; pre-start internal accounts get the pre-start policy. */
  conditionalAccess: "none" | "guest-restricted" | "pre-start";
}

/** FR-1.1, FR-3.1. The personal email is passed through and never stored. */
export interface IdentityAdapter extends BaseAdapter {
  key: "identity";
  /** Invite the starter as an Entra B2B guest with conditional access. */
  inviteGuest(journeyId: string, personalEmail: string): Promise<{ status: IdentityStatus; invitedAt: string }>;
  /** Create the internal account (pre-start conditional access). Returns the new UPN. */
  createInternalAccount(journeyId: string): Promise<{ status: IdentityStatus; upn: string }>;
  /** Additive: full account snapshot for admin and starter views. */
  getAccount(journeyId: string): Promise<IdentityAccount>;
}
