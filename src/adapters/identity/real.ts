import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import type { IdentityAccount, IdentityAdapter, IdentityStatus } from "./types";

type Payload = { invitedAt?: string; guestObjectId?: string; conditionalAccess?: IdentityAccount["conditionalAccess"] };

/**
 * Real identity adapter (D19). The Graph call is made from the signed-in admin's browser with a delegated
 * token (there is no client secret on the server), so the server only RECORDS the outcome here: guest object
 * id and status. The personal email is never stored.
 */
export interface IdentityReal extends IdentityAdapter {
  recordGuestInvite(journeyId: string, guestObjectId: string): Promise<{ status: IdentityStatus; invitedAt: string }>;
}

export function createIdentityReal(store: StateStore): IdentityReal {
  const m = statusMock(store, "identity", "none", ["none", "invited", "guest_active", "internal_created"]);
  return {
    key: "identity",
    getStatus: m.getStatus,
    async recordGuestInvite(journeyId, guestObjectId) {
      const invitedAt = new Date().toISOString();
      await m.write(journeyId, "invited", { invitedAt, guestObjectId, conditionalAccess: "guest-restricted" } satisfies Payload);
      return { status: "invited", invitedAt };
    },
    async inviteGuest() {
      throw new Error("Guest invites are sent from the admin's browser through Microsoft Graph, then recorded with recordGuestInvite");
    },
    async createInternalAccount() {
      throw new Error("Internal account creation is not implemented for the real identity adapter");
    },
    async getAccount(journeyId) {
      const s = await m.read<Payload>(journeyId);
      return { status: s.status as IdentityStatus, invitedAt: s.payload.invitedAt ?? null, upn: null, conditionalAccess: s.payload.conditionalAccess ?? "none" };
    },
  };
}
