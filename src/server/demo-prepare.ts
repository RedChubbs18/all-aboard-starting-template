/**
 * Demo staging for the Team 05 pitch (`npm run demo:prepare`, docs/DEMO-SCRIPT.md).
 *
 * Idempotent and safe while the dev servers run (it writes through the same Prisma client and services they use):
 *  1. reseeds MyJourney in place (same function as `npm run db:seed`; keeps prisma/seed.local.json persona mappings);
 *  2. stages Alex Morgan at Day 0 with today's start date, using the existing services and the demo "jump to Day 0"
 *     logic, leaving the Group Exec welcome video, collect equipment, goals and flex benefits open;
 *  3. makes sure Imogen's MI shows at least one major flag and a chase-able line manager.
 *
 * Alex is a member test account, so the guest-conversion hook must never run for him. Two independent guards:
 * enqueueing is switched off for this module's own writes, and identity-conversion refuses any user whose display
 * name is not a `team05-` name before it makes a Graph call.
 *
 * Nothing here sends email, invites or notifications to anyone outside the app.
 */
import type { PrismaClient } from "@prisma/client";
import { entitledModels } from "@/adapters/equipment/catalogue";
import { getAdapter } from "@/adapters/registry";
import type { JourneyState, Stage } from "@/domain/types";
import { prisma as defaultPrisma } from "./db";
import { jumpToDay0 } from "./integration-service";
import { confirmDay0, loadJourney, proposeDay0 } from "./journey-service";
import { getOverview } from "./mi-service";
import { seedDatabase } from "./seed";

export const ALEX_ID = "alex-morgan";
export const ALEX_JOURNEY_ID = "journey-alex-morgan";
export const DANA_ID = "dana-sample";
export const DAY0_WHERE = "Example House, Floor 3 reception";
export const DAY0_WHO = "Ask for Dana Sample";
export const DAY0_NOTES = "Bring your photo ID if you have it. Dana will walk you to the team area and introduce you to Kai, your buddy.";
/** Alex's entitled engineering laptop (D29). */
export const ALEX_MODEL = "MacBook Pro M5 Pro";
/** Day 0 tasks the presenters demo, left open on purpose. */
export const OPEN_DAY0_KEYS = ["watch-executive-welcome", "collect-equipment", "draft-30-60-90-goals", "review-flex-benefits"] as const;

const DAY = 86_400_000;

export interface DemoSummary {
  alex: {
    stage: Stage;
    startDate: string;
    device: string | null;
    peripherals: string[];
    day0: { where: string; whenAt: string; who: string; confirmed: boolean } | null;
    induction: string | null;
    passOrdered: boolean;
    openDay0Tasks: { key: string; title: string; status: string }[];
  };
  dana: { starters: number; names: string[] };
  mi: { majorFlags: number; flaggedLms: string[]; chaseableLms: string[] };
}

/** Today at 09:00 UTC (UK winter time; in BST this is 10:00, which is fine for a demo arrangement). */
const todayAtNine = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0));

/** Stages Alex at Day 0. Assumes a fresh seed (his journey at CONDITIONAL_OFFER). */
export async function stageAlexAtDay0(now: Date = new Date(), db: PrismaClient = defaultPrisma): Promise<void> {
  const j = await loadJourney(ALEX_JOURNEY_ID, db);
  if (!j) throw new Error("Alex's journey is missing: run the seed first");
  // The LM proposes, the starter confirms (both audited). They do not need the stage to have opened yet.
  await proposeDay0(ALEX_JOURNEY_ID, { where: DAY0_WHERE, whenAt: todayAtNine(now), who: DAY0_WHO, notes: DAY0_NOTES }, DANA_ID, db);
  await confirmDay0(ALEX_JOURNEY_ID, ALEX_ID, db);
  // Existing demo logic: device choice (his entitled engineering Mac, with peripherals), induction booked, photo pass ordered
  // (synthetic reference), pre-Day-0 tasks completed, start date moved to today. Day 0 tasks stay open.
  await jumpToDay0(ALEX_JOURNEY_ID, { now });
}

/**
 * Imogen's MI needs a major flag and a chase-able LM. The seed normally provides both (an LM action more than five days
 * overdue, an LM with no chase in the last 24h). If a future seed change loses them, back-date one open LM action
 * for a line manager other than Dana, so the demo never depends on luck.
 */
export async function ensureMajorFlag(now: Date = new Date(), db: PrismaClient = defaultPrisma): Promise<boolean> {
  const has = async () => {
    const o = await getOverview({}, now);
    return o.lm.flags.length > 0 && o.lm.league.some((r) => r.canChase && r.flagCount > 0);
  };
  if (await has()) return false;
  const candidates = await db.task.findMany({
    where: { owner: "LM", status: { in: ["TODO", "IN_PROGRESS"] }, applicable: true, journey: { status: "active", lmId: { not: DANA_ID } } },
    include: { journey: true },
    orderBy: { dueDate: "asc" },
    take: 1,
  });
  const t = candidates[0];
  if (!t) return false;
  await db.task.update({ where: { id: t.id }, data: { dueDate: new Date(now.getTime() - 8 * DAY) } });
  await db.event.deleteMany({ where: { type: "NUDGE_SENT", entity: "User", entityId: t.journey.lmId, createdAt: { gt: new Date(now.getTime() - DAY) } } });
  return has();
}

/** Reads the staged state back (also used by the tests and the checklist printed by the script). */
export async function summarise(now: Date = new Date(), db: PrismaClient = defaultPrisma): Promise<DemoSummary> {
  const j = (await loadJourney(ALEX_JOURNEY_ID, db)) as JourneyState;
  const eq = await getAdapter("equipment");
  const choice = await eq.getChoice(ALEX_JOURNEY_ID);
  const booking = await (await getAdapter("booking")).getBooking(ALEX_JOURNEY_ID);
  const pass = await (await getAdapter("pass")).getOrder(ALEX_JOURNEY_ID);
  const day0 = await db.day0Arrangement.findUnique({ where: { journeyId: ALEX_JOURNEY_ID } });
  const danaJourneys = await db.journey.findMany({ where: { lmId: DANA_ID, status: "active" }, select: { starterId: true } });
  const danaStarters = await db.user.findMany({ where: { id: { in: danaJourneys.map((x) => x.starterId) } }, select: { displayName: true } });
  const overview = await getOverview({}, now);
  return {
    alex: {
      stage: j.currentStage,
      startDate: j.startDate.toISOString().slice(0, 10),
      device: choice?.model ?? null,
      peripherals: choice?.peripherals ?? [],
      day0: day0 ? { where: day0.where, whenAt: day0.whenAt.toISOString(), who: day0.who, confirmed: !!day0.confirmedAt } : null,
      induction: booking?.sessionId ?? null,
      passOrdered: !!pass,
      openDay0Tasks: j.tasks
        .filter((t) => t.applicable && t.stage === "DAY_0" && t.status !== "DONE")
        .map((t) => ({ key: t.key, title: t.title, status: t.status })),
    },
    dana: { starters: danaJourneys.length, names: danaStarters.map((x) => x.displayName).sort() },
    mi: {
      majorFlags: overview.lm.flags.length,
      flaggedLms: [...new Set(overview.lm.flags.map((f) => f.lmName))],
      chaseableLms: overview.lm.league.filter((r) => r.canChase).map((r) => r.lmName),
    },
  };
}

export async function prepareDemoData(opts: { now?: Date; log?: (m: string) => void; db?: PrismaClient } = {}): Promise<DemoSummary> {
  const now = opts.now ?? new Date();
  const db = opts.db ?? defaultPrisma;
  const log = opts.log ?? (() => {});
  const prev = process.env.CONVERSION_ENQUEUE_DISABLED;
  process.env.CONVERSION_ENQUEUE_DISABLED = "1";
  try {
    const r = await seedDatabase(db);
    log(`Reseeded MyJourney: ${r.users} users, ${r.journeys} journeys`);
    await stageAlexAtDay0(now, db);
    log("Staged Alex at Day 0");
    if (await ensureMajorFlag(now, db)) log("Back-dated one LM action to create a major flag");
    return await summarise(now, db);
  } finally {
    if (prev === undefined) delete process.env.CONVERSION_ENQUEUE_DISABLED;
    else process.env.CONVERSION_ENQUEUE_DISABLED = prev;
  }
}

/** True when Alex's staged laptop is his entitlement (guards against a catalogue change). */
export const alexModelIsEntitled = () => entitledModels("ENGINEERING").some((m) => m.label === ALEX_MODEL);
