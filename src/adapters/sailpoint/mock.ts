import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import type { SailPointAdapter } from "./types";

export function createSailPointMock(store: StateStore): SailPointAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "sailpoint", "not_started", ["not_started", "requested", "applied", "failed"]);
  return {
    ...m,
    key: "sailpoint",
    async applyPersona(journeyId, persona = "Pre-start colleague") {
      await m.write(journeyId, "applied", { persona });
      return { status: "applied", persona };
    },
  };
}
