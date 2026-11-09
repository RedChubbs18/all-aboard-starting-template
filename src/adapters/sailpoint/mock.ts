import { statusMock } from "../mock-helpers";
import { hashString } from "../mock-seed";
import type { StateStore } from "../types";
import type { SailPointAdapter } from "./types";

const DEFAULT_PERSONA = "Pre-start colleague";
const STATUSES = ["not_started", "requested", "applied", "failed", "file_id_created"] as const;

type Payload = { persona?: string; fileId?: { id: string; createdAt: string } };

/** Stable synthetic Colleague File ID, `CF-` plus six digits. */
const fileIdFor = (journeyId: string) => `CF-${String(100000 + (hashString(`cf:${journeyId}`) % 900000))}`;

export function createSailPointMock(store: StateStore): SailPointAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "sailpoint", "not_started", STATUSES);
  const createFileId = async (journeyId: string) => {
    const cur = await m.read<Payload>(journeyId);
    const fileId = cur.payload.fileId ?? { id: fileIdFor(journeyId), createdAt: new Date().toISOString() };
    await m.write(journeyId, "file_id_created", { fileId });
    return fileId;
  };
  return {
    ...m,
    key: "sailpoint",
    async applyPersona(journeyId, persona = DEFAULT_PERSONA) {
      await m.write(journeyId, "applied", { persona });
      return { status: "applied", persona };
    },
    async getPersona(journeyId) {
      return (await m.read<Payload>(journeyId)).payload.persona ?? null;
    },
    createColleagueFileId: createFileId,
    async getColleagueFileId(journeyId) {
      return (await m.read<Payload>(journeyId)).payload.fileId ?? null;
    },
    async simulate(journeyId, status, detail) {
      if (!(STATUSES as readonly string[]).includes(status)) throw new Error(`sailpoint: unsupported status "${status}"`);
      if (status === "applied") await m.write(journeyId, status, { persona: DEFAULT_PERSONA });
      else if (status === "file_id_created") await createFileId(journeyId);
      else if (status === "not_started") await m.write(journeyId, status, { persona: undefined, fileId: undefined });
      else await m.write(journeyId, status);
      return detail ? m.write(journeyId, status, { detail }) : m.getStatus(journeyId);
    },
  };
}
