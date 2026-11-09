import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import type { IdentityAdapter } from "./types";

export function createIdentityMock(store: StateStore): IdentityAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "identity", "none", ["none", "invited", "guest_active", "internal_created"]);
  return {
    ...m,
    key: "identity",
    async inviteGuest(journeyId, personalEmail) {
      if (!/^[^@\s]+@[^@\s]+$/.test(personalEmail)) throw new Error("Invalid email");
      const invitedAt = new Date().toISOString();
      await m.write(journeyId, "invited", { invitedAt }); // email deliberately not persisted
      return { status: "invited", invitedAt };
    },
    async createInternalAccount(journeyId) {
      const upn = `new.starter.${journeyId.slice(0, 6)}@example.test`;
      await m.write(journeyId, "internal_created", { upn });
      return { status: "internal_created", upn };
    },
  };
}
