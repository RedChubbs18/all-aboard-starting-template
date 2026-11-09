import { randomUUID } from "node:crypto";
import { statusMock } from "../mock-helpers";
import { GLOBAL_JOURNEY, type StateStore } from "../types";
import type { NotificationAdapter, SentNotification } from "./types";

const MAX_OUTBOX = 200;

export function createNotificationMock(store: StateStore): NotificationAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "notification", "ready", ["ready"]);
  const outbox = async () => (await store.get<{ items?: SentNotification[] }>(GLOBAL_JOURNEY, "notification"))?.payload.items ?? [];
  return {
    ...m,
    key: "notification",
    async send(input) {
      if (!input.toUserId || !input.subject) throw new Error("toUserId and subject are required");
      const sent: SentNotification = { ...input, id: randomUUID(), sentAt: new Date().toISOString() };
      const items = [...(await outbox()), sent].slice(-MAX_OUTBOX);
      await store.set(GLOBAL_JOURNEY, "notification", "ready", { items });
      return sent;
    },
    async list(filter = {}) {
      return (await outbox()).filter(
        (n) => (!filter.toUserId || n.toUserId === filter.toUserId) && (!filter.journeyId || n.journeyId === filter.journeyId),
      );
    },
  };
}
