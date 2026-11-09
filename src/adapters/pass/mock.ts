import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import type { PassAdapter, PassOrder } from "./types";

/** A photoRef is an opaque id or hash. Anything that looks like image data (or is long) is refused, so bytes are never stored. */
const OPAQUE_REF = /^[A-Za-z0-9._:\-/]{1,128}$/;

export function createPassMock(store: StateStore): PassAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "pass", "not_started", ["not_started", "ordered", "printed", "delivered", "failed"]);
  return {
    ...m,
    key: "pass",
    async orderPass(journeyId, input) {
      if (!input.photoRef || !input.location) throw new Error("photoRef and location are required");
      if (input.photoRef.startsWith("data:") || !OPAQUE_REF.test(input.photoRef)) {
        throw new Error("photoRef must be an opaque reference or hash, not image data");
      }
      const order: PassOrder = {
        ref: `PASS-${journeyId.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`,
        status: "ordered",
        photoRef: input.photoRef,
        location: input.location,
      };
      await m.write(journeyId, "ordered", { order });
      return order;
    },
    async getOrder(journeyId) {
      return (await m.read<{ order?: PassOrder }>(journeyId)).payload.order ?? null;
    },
  };
}
