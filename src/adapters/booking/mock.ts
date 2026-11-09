import { statusMock } from "../mock-helpers";
import { GLOBAL_JOURNEY, type StateStore } from "../types";
import type { Booking, BookingAdapter, InductionSession } from "./types";

function sessionsFrom(now: Date): InductionSession[] {
  return [1, 2, 3].map((m) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, 1, 9, 30));
    return { id: `ind-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, startsAt: d.toISOString(), location: "Example Office, Learning Suite", remaining: 12 };
  });
}

export function createBookingMock(store: StateStore): BookingAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "booking", "not_started", ["not_started", "booked", "failed"]);
  const booked = async (sessionId: string) => {
    let n = 0;
    // Count bookings across journeys is not possible via the store; capacity is tracked in GLOBAL state.
    const g = await store.get<{ counts?: Record<string, number> }>(GLOBAL_JOURNEY, "booking");
    n = g?.payload.counts?.[sessionId] ?? 0;
    return n;
  };
  return {
    ...m,
    key: "booking",
    async listSessions() {
      const out: InductionSession[] = [];
      for (const s of sessionsFrom(new Date())) out.push({ ...s, remaining: s.remaining - (await booked(s.id)) });
      return out;
    },
    async book(journeyId, sessionId) {
      const sessions = await this.listSessions();
      const s = sessions.find((x) => x.id === sessionId);
      if (!s) throw new Error(`Unknown session ${sessionId}`);
      if (s.remaining <= 0) throw new Error("Session is full");
      const existing = await this.getBooking(journeyId);
      const g = await store.get<{ counts?: Record<string, number> }>(GLOBAL_JOURNEY, "booking");
      const counts = { ...(g?.payload.counts ?? {}) };
      if (existing) counts[existing.sessionId] = Math.max(0, (counts[existing.sessionId] ?? 1) - 1);
      counts[sessionId] = (counts[sessionId] ?? 0) + 1;
      await store.set(GLOBAL_JOURNEY, "booking", "available", { counts });
      const booking: Booking = { sessionId, bookedAt: new Date().toISOString() };
      await m.write(journeyId, "booked", { booking });
      return booking;
    },
    async getBooking(journeyId) {
      return (await m.read<{ booking?: Booking }>(journeyId)).payload.booking ?? null;
    },
  };
}
