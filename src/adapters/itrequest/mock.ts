import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import { ColleagueFileIdMissingError, type ITRequest, type ITRequestAdapter } from "./types";

/**
 * Reads the SailPoint mock state from the same store: SailPoint (IAM) generates the Colleague File ID.
 */
export function createITRequestMock(store: StateStore): ITRequestAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "itrequest", "not_started", ["not_started", "requested", "fulfilled", "failed"]);
  const hasFileId = async (journeyId: string) => {
    const sp = await store.get<{ fileId?: unknown }>(journeyId, "sailpoint");
    return !!sp && (sp.status === "file_id_created" || !!sp.payload.fileId);
  };
  return {
    ...m,
    key: "itrequest",
    async canRaise(journeyId) {
      return (await hasFileId(journeyId))
        ? { allowed: true }
        : { allowed: false, reason: new ColleagueFileIdMissingError().message };
    },
    async raise(journeyId, item) {
      if (!item.trim()) throw new Error("item is required");
      if (!(await hasFileId(journeyId))) throw new ColleagueFileIdMissingError();
      const cur = await m.read<{ requests?: ITRequest[] }>(journeyId);
      const requests = cur.payload.requests ?? [];
      const req: ITRequest = { ref: `ITR-${1000 + requests.length + 1}`, item, status: "requested", raisedAt: new Date().toISOString() };
      await m.write(journeyId, "requested", { requests: [...requests, req] });
      return req;
    },
    async list(journeyId) {
      return (await m.read<{ requests?: ITRequest[] }>(journeyId)).payload.requests ?? [];
    },
  };
}
