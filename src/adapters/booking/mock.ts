import { statusMock } from "../mock-helpers";
import { GLOBAL_JOURNEY, type StateStore } from "../types";
import type { Booking, BookingAdapter, InductionSession } from "./types";

const CAPACITY = [12, 10, 8];

/** First Tuesday of the month, 09:30 UTC. */
function firstTuesday(year: number, month: number): Date {
  const d = new Date(Date.UTC(year, month, 1, 9, 30));
  d.setUTCDate(1 + ((2 - d.getUTCDay() + 7) % 7));
  return d;
}

/** The next three monthly "Welcome to Lloyds" sessions that start after `now`. */
export function sessionsFrom(now: Date): InductionSession[] {
  const out: InductionSession[] = [];
  for (let m = 0; out.length < 3; m++) {
    const d = firstTuesday(now.getUTCFullYear(), now.getUTCMonth() + m);
    if (d <= now) continue;
    const capacity = CAPACITY[out.length];
    out.push({
      id: `ind-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      title: "Welcome to Lloyds",
      startsAt: d.toISOString(),
      location: "Example Office, Learning Suite",
      capacity,
      remaining: capacity,
    });
  }
  return out;
}

type Counts = { counts?: Record<string, number> };

export function createBookingMock(store: StateStore): BookingAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "booking", "not_started", ["not_started", "booked", "failed"]);
  // Capacity is tracked in GLOBAL state because the store cannot count across journeys.
  const counts = async () => ({ ...((await store.get<Counts>(GLOBAL_JOURNEY, "booking"))?.payload.counts ?? {}) });
  const saveCounts = (c: Record<string, number>) => store.set(GLOBAL_JOURNEY, "booking", "available", { counts: c });
  const self = {
    ...m,
    key: "booking" as const,
    async listSessions() {
      const c = await counts();
      return sessionsFrom(new Date()).map((s) => ({ ...s, remaining: Math.max(0, (s.capacity ?? 0) - (c[s.id] ?? 0)) }));
    },
    async book(journeyId: string, sessionId: string): Promise<Booking> {
      const s = (await self.listSessions()).find((x) => x.id === sessionId);
      if (!s) throw new Error(`Unknown session ${sessionId}`);
      const existing = await self.getBooking(journeyId);
      if (existing?.sessionId === sessionId) return existing;
      if (s.remaining <= 0) throw new Error("Session is full");
      const c = await counts();
      if (existing) c[existing.sessionId] = Math.max(0, (c[existing.sessionId] ?? 1) - 1);
      c[sessionId] = (c[sessionId] ?? 0) + 1;
      await saveCounts(c);
      const booking: Booking = { sessionId, bookedAt: new Date().toISOString() };
      await m.write(journeyId, "booked", { booking });
      return booking;
    },
    async getBooking(journeyId: string) {
      return (await m.read<{ booking?: Booking }>(journeyId)).payload.booking ?? null;
    },
    async cancelBooking(journeyId: string) {
      const existing = await self.getBooking(journeyId);
      if (!existing) return;
      const c = await counts();
      c[existing.sessionId] = Math.max(0, (c[existing.sessionId] ?? 1) - 1);
      await saveCounts(c);
      await m.write(journeyId, "not_started", { booking: undefined });
    },
  };
  return self;
}
