import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import { DEVICE_MODELS, findModel } from "./catalogue";
import type { CollectionPoint, EquipmentAdapter, EquipmentCatalogue, EquipmentChoice, HomeWorkingOrder } from "./types";

export const CATALOGUE: EquipmentCatalogue = {
  devices: DEVICE_MODELS,
  peripherals: [
    { id: "monitor", label: "Monitor" },
    { id: "keyboard", label: "Keyboard" },
    { id: "mouse", label: "Mouse" },
    { id: "headset", label: "Headset" },
    { id: "dock", label: "Docking station" },
  ],
  homeWorking: [
    { id: "desk", label: "Height-adjustable desk" },
    { id: "chair", label: "Office chair" },
    { id: "monitor-home", label: "Home monitor" },
    { id: "laptop-stand", label: "Laptop stand" },
    { id: "webcam", label: "Webcam" },
  ],
  collectionPoints: [
    { id: "TECH_BAR", label: "Tech bar, Example Office Floor 1" },
    { id: "MAILROOM", label: "Mailroom, Example Office Ground floor" },
  ],
};

const pointLabel = (p: CollectionPoint) => CATALOGUE.collectionPoints.find((c) => c.id === p)!.label;

export function createEquipmentMock(store: StateStore): EquipmentAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "equipment", "not_started", ["not_started", "ordered", "ready", "collected", "failed"]);
  return {
    ...m,
    key: "equipment",
    async submitChoice(journeyId, choice) {
      if (choice.device !== "MAC" && choice.device !== "WINDOWS") throw new Error("device must be MAC or WINDOWS");
      const point = choice.collectionPoint ?? "TECH_BAR";
      if (!CATALOGUE.collectionPoints.some((c) => c.id === point)) throw new Error("collectionPoint must be TECH_BAR or MAILROOM");
      // D29: an explicit model must match the device; otherwise default to the standard-tier model of that device.
      const model = choice.modelId ? findModel(choice.modelId) : DEVICE_MODELS.find((m) => m.device === choice.device && m.tier === "STANDARD");
      if (!model) throw new Error("Unknown device model");
      if (model.device !== choice.device) throw new Error("The model does not match the device");
      const out: EquipmentChoice = {
        device: choice.device,
        modelId: model.id,
        model: model.label,
        peripherals: [...choice.peripherals],
        collectionPoint: pointLabel(point),
        ref: `EQ-${journeyId.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`,
      };
      await m.write(journeyId, "ordered", { choice: out });
      return out;
    },
    async getChoice(journeyId) {
      return (await m.read<{ choice?: EquipmentChoice }>(journeyId)).payload.choice ?? null;
    },
    async getCatalogue() {
      return CATALOGUE;
    },
    async orderHomeWorking(journeyId, itemIds) {
      const labels = itemIds.map((id) => CATALOGUE.homeWorking.find((i) => i.id === id)?.label);
      if (!itemIds.length || labels.some((l) => !l)) throw new Error("Choose one or more valid home-working items");
      const order: HomeWorkingOrder = {
        ref: `HW-${journeyId.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`,
        items: labels as string[],
        status: "ordered",
        orderedAt: new Date().toISOString(),
      };
      await m.write(journeyId, "ordered", { homeWorking: order });
      return order;
    },
    async getHomeWorkingOrder(journeyId) {
      return (await m.read<{ homeWorking?: HomeWorkingOrder }>(journeyId)).payload.homeWorking ?? null;
    },
  };
}
