import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import type { ITRequest, ITRequestAdapter } from "./types";

export function createITRequestMock(store: StateStore): ITRequestAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "itrequest", "not_started", ["not_started", "requested", "fulfilled", "failed"]);
  return {
    ...m,
    key: "itrequest",
    async raise(journeyId, item) {
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
