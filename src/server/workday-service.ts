/**
 * Mock Workday integration (D24, docs/DEMO-WORKDAY.md). Server-to-server only: HMAC-signed requests from the
 * demo mock Workday app create a starter + journey (offer accepted) or read the team/line manager directory.
 *
 * No personal email ever arrives here (FR-1.9): the payload is validated strictly and any email-looking
 * value is rejected. Journey and task writes go through journey-service.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { JOB_FAMILIES } from "@/domain/job-family";
import { parseRoles } from "@/lib/auth/roles";
import { isPlaceholderSecret } from "@/lib/auth/server";
import { createJourneyInTx, recordEvent, setTaskStatusInTx } from "./journey-service";
import { createRateLimiter } from "./rate-limit";

export const SIGNATURE_HEADER = "x-workday-signature";
export const TIMESTAMP_HEADER = "x-workday-timestamp";
export const MAX_SKEW_SECONDS = 300;
const MIN_SECRET_LENGTH = 32;

export class WorkdayError extends Error {
  constructor(public status: 400 | 401 | 409 | 413 | 415 | 429, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

/** The secret when the integration is enabled (32+ chars, not a placeholder), otherwise null (routes return 404). */
export function workdaySecret(): string | null {
  const s = process.env.WORKDAY_WEBHOOK_SECRET ?? "";
  return s.length >= MIN_SECRET_LENGTH && !isPlaceholderSecret(s) ? s : null;
}

export const signWorkday = (secret: string, timestamp: string | number, rawBody: string): string =>
  "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

/** Throws WorkdayError(401) unless the timestamp is fresh and the HMAC matches (constant-time compare). */
export function verifyWorkdaySignature(secret: string, headers: Headers, rawBody: string, nowMs = Date.now()): void {
  const ts = headers.get(TIMESTAMP_HEADER) ?? "";
  const sig = headers.get(SIGNATURE_HEADER) ?? "";
  if (!/^\d{1,12}$/.test(ts)) throw new WorkdayError(401, "unauthorized", "Missing or invalid timestamp");
  if (Math.abs(nowMs / 1000 - Number(ts)) > MAX_SKEW_SECONDS) throw new WorkdayError(401, "unauthorized", "Stale timestamp");
  const expected = Buffer.from(signWorkday(secret, ts, rawBody));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new WorkdayError(401, "unauthorized", "Bad signature");
}

const limiter = createRateLimiter({ max: 60, windowMs: 60_000 });
export function takeWorkdayRateLimit() {
  return limiter.take("workday");
}
export const resetWorkdayRateLimit = () => limiter.reset();

// ------------------------------------------------------------------- schema

const EMAIL_LIKE = /[^\s@]+@[^\s@]+/;
const hasEmail = (v: unknown): boolean =>
  typeof v === "string" ? EMAIL_LIKE.test(v) : Array.isArray(v) ? v.some(hasEmail) : v && typeof v === "object" ? Object.entries(v).some(([k, x]) => EMAIL_LIKE.test(k) || hasEmail(x)) : false;

const text = (max: number) => z.string().trim().min(1).max(max);
const key = z.string().trim().regex(/^[A-Za-z0-9._-]{1,64}$/, "Invalid key");

export const offerAcceptedSchema = z
  .object({
    offerId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid offer id"),
    candidate: z.object({ firstName: text(60), lastName: text(60) }).strict(),
    jobTitle: text(120),
    /** D29: required; decides the device entitlement. */
    jobFamily: z.enum(JOB_FAMILIES),
    teamKey: key,
    lineManagerKey: key,
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Invalid date"),
    conditions: z.array(text(200)).max(20),
    guest: z.object({ objectId: z.string().uuid().nullable(), inviteStatus: z.enum(["invited", "simulated", "failed"]) }).strict(),
  })
  .strict();
export type OfferAccepted = z.infer<typeof offerAcceptedSchema>;

function parseOffer(raw: string): OfferAccepted {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new WorkdayError(400, "bad_json", "Request body must be JSON");
  }
  if (hasEmail(json)) throw new WorkdayError(400, "validation", "Personal email addresses must not be sent (FR-1.9)");
  const r = offerAcceptedSchema.safeParse(json);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const i of r.error.issues) fields[i.path.join(".") || "_"] ??= i.message;
    throw new WorkdayError(400, "validation", "Validation failed", fields);
  }
  return r.data;
}

// ------------------------------------------------------------------ service

const ADAPTER = "workday";
/** Idempotency record, one per offer: journeyId column holds a synthetic key, payload the created ids. */
const lookupKey = (offerId: string) => `WORKDAY-OFFER:${offerId}`;
const lookupOffer = async (offerId: string) => {
  const row = await prisma.integrationState.findUnique({ where: { journeyId_adapterKey: { journeyId: lookupKey(offerId), adapterKey: ADAPTER } } });
  const p = row?.payload as { journeyId?: string; starterId?: string } | undefined;
  return p?.journeyId && p.starterId ? { journeyId: p.journeyId, starterId: p.starterId } : null;
};

const OFFER_ROW = "workday-offer";
const GUEST_HAS_JOURNEY = "This guest already has a journey; run npm run db:reset or use a different email";

/** Writes the per-offer idempotency record, ignoring a concurrent delivery that already wrote it. */
async function writeIdempotency(offerId: string, ids: { journeyId: string; starterId: string }, status: string) {
  try {
    await prisma.integrationState.create({ data: { journeyId: lookupKey(offerId), adapterKey: ADAPTER, status, payload: ids } });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
}

/** True when this starter's journey was created from this same offer (workday-offer row, or the offer's own placeholder UPN). */
async function journeyIsFromOffer(starter: { id: string; upn: string }, journeyId: string, offerId: string, placeholderUpn: string): Promise<boolean> {
  if (starter.upn === placeholderUpn) return true;
  const row = await prisma.integrationState.findUnique({ where: { journeyId_adapterKey: { journeyId, adapterKey: OFFER_ROW } } });
  return (row?.payload as { offerId?: string } | undefined)?.offerId === offerId;
}

/**
 * Idempotent on `offerId`. Everything is created in ONE transaction, idempotency record included, so a failed
 * delivery leaves nothing behind and a retry returns the same ids. A guest that already has a journey from a
 * different offer (a rehearsal reusing the same email) is refused with 409.
 */
export async function handleOfferAccepted(rawBody: string): Promise<{ journeyId: string; starterId: string }> {
  const o = parseOffer(rawBody);
  const existing = await lookupOffer(o.offerId);
  if (existing) return existing;

  const [team, lm] = await Promise.all([prisma.team.findUnique({ where: { id: o.teamKey } }), prisma.user.findUnique({ where: { id: o.lineManagerKey } })]);
  if (!team) throw new WorkdayError(409, "unknown_team", `Unknown team: ${o.teamKey}`);
  if (!lm || !parseRoles(lm.roles).includes("LM") || lm.teamId !== team.id) throw new WorkdayError(409, "unknown_line_manager", `Unknown line manager for team ${o.teamKey}: ${o.lineManagerKey}`);

  const displayName = `${o.candidate.firstName} ${o.candidate.lastName}`;
  const oid = o.guest.objectId;
  // Work contact field only: a non-PII placeholder, never the candidate's personal email.
  const upn = `guest-${o.offerId}@myjourney.invalid`.toLowerCase();
  let starter = oid ? await prisma.user.findUnique({ where: { entraOid: oid } }) : null;
  starter ??= await prisma.user.findUnique({ where: { upn } });
  if (starter) {
    const j = await prisma.journey.findUnique({ where: { starterId: starter.id }, select: { id: true } });
    if (j) {
      if (!(await journeyIsFromOffer(starter, j.id, o.offerId, upn))) throw new WorkdayError(409, "starter_has_journey", GUEST_HAS_JOURNEY);
      const ids = { journeyId: j.id, starterId: starter.id };
      await writeIdempotency(o.offerId, ids, "created");
      return ids;
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const created = !starter;
      const s =
        starter ??
        (await tx.user.create({
          data: { id: `u-${randomUUID().slice(0, 8)}`, upn, displayName, entraOid: oid, roles: ["STARTER"], teamId: team.id, reportsToId: lm.id, jobTitle: o.jobTitle, jobFamily: o.jobFamily, teamRole: "Team member" },
        }));
      // A guest user that already existed (no journey yet) takes the job title and family from the offer.
      if (!created) await tx.user.update({ where: { id: s.id }, data: { jobTitle: o.jobTitle, jobFamily: o.jobFamily } });
      if (created) await recordEvent({ journeyId: null, actorId: null, type: "WORKDAY_STARTER_CREATED", entity: "User", entityId: s.id, data: { offerId: o.offerId, teamId: team.id } }, tx);
      const journey = await createJourneyInTx(tx, { starterId: s.id, lmId: lm.id, teamId: team.id, startDate: new Date(`${o.startDate}T00:00:00.000Z`), actorId: null });
      if (o.guest.inviteStatus !== "failed") await setTaskStatusInTx(tx, journey.id, "guest-invite-sent", "DONE", { actorId: null, evidence: o.guest.inviteStatus });
      const ids = { journeyId: journey.id, starterId: s.id };
      await tx.integrationState.create({
        data: { journeyId: journey.id, adapterKey: OFFER_ROW, status: o.guest.inviteStatus, payload: { offerId: o.offerId, jobTitle: o.jobTitle, jobFamily: o.jobFamily, conditions: o.conditions, inviteStatus: o.guest.inviteStatus } },
      });
      await recordEvent(
        {
          journeyId: journey.id, actorId: null, type: "WORKDAY_OFFER_ACCEPTED", entity: "Journey", entityId: journey.id,
          data: { offerId: o.offerId, jobTitle: o.jobTitle, jobFamily: o.jobFamily, conditionCount: o.conditions.length, inviteStatus: o.guest.inviteStatus, guestLinked: oid !== null },
        },
        tx,
      );
      await tx.integrationState.create({ data: { journeyId: lookupKey(o.offerId), adapterKey: ADAPTER, status: "created", payload: ids } });
      return ids;
    });
  } catch (e) {
    // A concurrent delivery of the same offer won the race (unique constraint): return what it created.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const won = await lookupOffer(o.offerId);
      if (won) return won;
      throw new WorkdayError(409, "starter_has_journey", GUEST_HAS_JOURNEY);
    }
    throw e;
  }
}

/** Teams with business area and their line managers (keys and names only). */
export async function getWorkdayDirectory() {
  const [teams, users] = await Promise.all([prisma.team.findMany({ orderBy: { name: "asc" } }), prisma.user.findMany({ orderBy: { displayName: "asc" } })]);
  const lms = users.filter((u) => parseRoles(u.roles).includes("LM"));
  return {
    teams: teams.map((t) => ({
      key: t.id,
      name: t.name,
      businessArea: t.area,
      lineManagers: lms.filter((u) => u.teamId === t.id).map((u) => ({ key: u.id, name: u.displayName })),
    })),
  };
}

/** Maps WorkdayError to a JSON response. */
export function workdayErrorResponse(e: unknown): Response | null {
  if (!(e instanceof WorkdayError)) return null;
  return Response.json({ error: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}) }, { status: e.status });
}
