import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import type { IdentityAccount, IdentityAdapter, IdentityStatus } from "./types";

type Payload = { invitedAt?: string; upn?: string; conditionalAccess?: IdentityAccount["conditionalAccess"] };

const STATUSES = ["none", "invited", "guest_active", "internal_created"] as const;

export function createIdentityMock(store: StateStore): IdentityAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "identity", "none", STATUSES);
  const upnFor = (journeyId: string) => `new.starter.${journeyId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase()}@example.test`;
  const invite = async (journeyId: string) => {
    const invitedAt = new Date().toISOString();
    await m.write(journeyId, "invited", { invitedAt, conditionalAccess: "guest-restricted" } satisfies Payload);
    return invitedAt;
  };
  const create = async (journeyId: string) => {
    const upn = upnFor(journeyId);
    await m.write(journeyId, "internal_created", { upn, conditionalAccess: "pre-start" } satisfies Payload);
    return upn;
  };
  return {
    ...m,
    key: "identity",
    async inviteGuest(journeyId, personalEmail) {
      if (!/^[^@\s]+@[^@\s]+$/.test(personalEmail)) throw new Error("Invalid email");
      // The personal email is deliberately not persisted.
      return { status: "invited", invitedAt: await invite(journeyId) };
    },
    async createInternalAccount(journeyId) {
      return { status: "internal_created", upn: await create(journeyId) };
    },
    async getAccount(journeyId) {
      const s = await m.read<Payload>(journeyId);
      return {
        status: s.status as IdentityStatus,
        invitedAt: s.payload.invitedAt ?? null,
        upn: s.payload.upn ?? null,
        conditionalAccess: s.payload.conditionalAccess ?? "none",
      };
    },
    async simulate(journeyId, status, detail) {
      if (!(STATUSES as readonly string[]).includes(status)) throw new Error(`identity: unsupported status "${status}"`);
      if (status === "invited") await invite(journeyId);
      else if (status === "internal_created") await create(journeyId);
      else if (status === "guest_active") await m.write(journeyId, status, { conditionalAccess: "guest-restricted" } satisfies Payload);
      else await m.write(journeyId, status, { invitedAt: undefined, upn: undefined, conditionalAccess: "none" } satisfies Payload);
      return detail ? m.write(journeyId, status, { detail }) : m.getStatus(journeyId);
    },
  };
}
