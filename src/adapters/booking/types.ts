import type { BaseAdapter } from "../types";

export interface InductionSession {
  id: string;
  startsAt: string; // ISO
  location: string;
  remaining: number;
  /** Additive. */
  title?: string;
  capacity?: number;
}

export interface Booking {
  sessionId: string;
  bookedAt: string;
}

/** FR-3.9: monthly "Welcome to Lloyds" induction. */
export interface BookingAdapter extends BaseAdapter {
  key: "booking";
  /** The next three monthly sessions, with remaining capacity. */
  listSessions(): Promise<InductionSession[]>;
  book(journeyId: string, sessionId: string): Promise<Booking>;
  getBooking(journeyId: string): Promise<Booking | null>;
  /** Additive. Frees the seat. */
  cancelBooking(journeyId: string): Promise<void>;
}
