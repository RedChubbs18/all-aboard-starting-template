import type { BaseAdapter } from "../types";

export interface NotificationInput {
  toUserId: string;
  /** `UPDATE` (additive) is a plain status update, e.g. "your account is ready". */
  kind: "PEV_REMINDER" | "CHASE_LM" | "SUPPORT" | "GENERAL" | "UPDATE";
  subject: string;
  body: string;
  journeyId?: string;
  /** Additive. In-app link opened from the notification bell. */
  link?: string;
}

export interface SentNotification extends NotificationInput {
  id: string;
  sentAt: string;
  /** Additive. */
  read: boolean;
}

/** FR-2.2, FR-MI.3. The real adapter must never send outside the tenant. */
export interface NotificationAdapter extends BaseAdapter {
  key: "notification";
  send(input: NotificationInput): Promise<SentNotification>;
  /** Outbox (mock) for demos and tests. */
  list(filter?: { toUserId?: string; journeyId?: string }): Promise<SentNotification[]>;
  /** Additive. Marks one notification read, but only for its recipient. Returns false when not found. */
  markRead(id: string, toUserId: string): Promise<boolean>;
  /** Additive. Unread count for a recipient. */
  unreadCount(toUserId: string): Promise<number>;
  /** Additive. Demo reset: drops notifications attached to a journey. */
  clearJourney(journeyId: string): Promise<number>;
}
