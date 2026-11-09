import type { BaseAdapter } from "../types";

export interface NotificationInput {
  toUserId: string;
  kind: "PEV_REMINDER" | "CHASE_LM" | "SUPPORT" | "GENERAL";
  subject: string;
  body: string;
  journeyId?: string;
}

export interface SentNotification extends NotificationInput {
  id: string;
  sentAt: string;
}

/** FR-2.2, FR-MI.3. The real adapter must never send outside the tenant. */
export interface NotificationAdapter extends BaseAdapter {
  key: "notification";
  send(input: NotificationInput): Promise<SentNotification>;
  /** Outbox (mock) for demos and tests. */
  list(filter?: { toUserId?: string; journeyId?: string }): Promise<SentNotification[]>;
}
