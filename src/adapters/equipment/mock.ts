import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import type { EquipmentAdapter, EquipmentChoice } from "./types";

export function createEquipmentMock(store: StateStore): EquipmentAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "equipment", "not_started", ["not_started", "ordered", "ready", "collected", "failed"]);
  return {
    ...m,
    key: "equipment",
    async submitChoice(journeyId, choice) {
      if (choice.device !== "MAC" && choice.device !== "WINDOWS") throw new Error("device must be MAC or WINDOWS");
      const out: EquipmentChoice = { ...choice, collectionPoint: "Tech bar, Example Office Floor 1", ref: `EQ-${journeyId.slice(0, 6)}` };
      await m.write(journeyId, "ordered", { choice: out });
      return out;
    },
    async getChoice(journeyId) {
      return (await m.read<{ choice?: EquipmentChoice }>(journeyId)).payload.choice ?? null;
    },
  };
}
