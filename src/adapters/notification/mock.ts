import { randomUUID } from "node:crypto";
import { statusMock } from "../mock-helpers";
import { GLOBAL_JOURNEY, type StateStore } from "../types";
import type { NotificationAdapter, SentNotification } from "./types";

const MAX_OUTBOX = 500;

/** Records notifications per recipient in GLOBAL state. Nothing is ever sent anywhere. */
export function createNotificationMock(store: StateStore): NotificationAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "notification", "ready", ["ready"]);
  const outbox = async () => (await store.get<{ items?: SentNotification[] }>(GLOBAL_JOURNEY, "notification"))?.payload.items ?? [];
  const save = (items: SentNotification[]) => store.set(GLOBAL_JOURNEY, "notification", "ready", { items: items.slice(-MAX_OUTBOX) });
  return {
    ...m,
    key: "notification",
    async send(input) {
      if (!input.toUserId || !input.subject) throw new Error("toUserId and subject are required");
      const sent: SentNotification = { ...input, id: randomUUID(), sentAt: new Date().toISOString(), read: false };
      await save([...(await outbox()), sent]);
      return sent;
    },
    async list(filter = {}) {
      return (await outbox()).filter(
        (n) => (!filter.toUserId || n.toUserId === filter.toUserId) && (!filter.journeyId || n.journeyId === filter.journeyId),
      );
    },
    async markRead(id, toUserId) {
      const items = await outbox();
      const hit = items.find((n) => n.id === id && n.toUserId === toUserId);
      if (!hit) return false;
      if (!hit.read) await save(items.map((n) => (n === hit ? { ...n, read: true } : n)));
      return true;
    },
    async unreadCount(toUserId) {
      return (await outbox()).filter((n) => n.toUserId === toUserId && !n.read).length;
    },
    async clearJourney(journeyId) {
      const items = await outbox();
      const kept = items.filter((n) => n.journeyId !== journeyId);
      if (kept.length !== items.length) await save(kept);
      return items.length - kept.length;
    },
  };
}
