import type { BaseAdapter } from "../types";

export interface InductionSession {
  id: string;
  startsAt: string; // ISO
  location: string;
  remaining: number;
}

export interface Booking {
  sessionId: string;
  bookedAt: string;
}

/** FR-3.9: monthly "Welcome to Lloyds" induction. */
export interface BookingAdapter extends BaseAdapter {
  key: "booking";
  listSessions(): Promise<InductionSession[]>;
  book(journeyId: string, sessionId: string): Promise<Booking>;
  getBooking(journeyId: string): Promise<Booking | null>;
}
