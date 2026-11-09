import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import type { PassAdapter, PassOrder } from "./types";

export function createPassMock(store: StateStore): PassAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "pass", "not_started", ["not_started", "ordered", "printed", "delivered", "failed"]);
  return {
    ...m,
    key: "pass",
    async orderPass(journeyId, input) {
      if (!input.photoRef || !input.location) throw new Error("photoRef and location are required");
      const order: PassOrder = { ref: `PASS-${journeyId.slice(0, 6)}`, status: "ordered", ...input };
      await m.write(journeyId, "ordered", { order });
      return order;
    },
    async getOrder(journeyId) {
      return (await m.read<{ order?: PassOrder }>(journeyId)).payload.order ?? null;
    },
  };
}
