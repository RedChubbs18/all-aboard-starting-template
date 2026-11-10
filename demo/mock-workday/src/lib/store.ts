import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JobFamily } from "./jobFamily";
import type { OfferInput } from "./validation";

/**
 * Tiny JSON-file store (demo only). Holds the candidate's personal email because the HR system is the system
 * of record. File is git-ignored, written atomically (tmp + rename) and serialised through a promise queue.
 */
export type OfferStatus = "sent" | "accepted_pending_invite" | "invite_sent" | "invite_simulated" | "onboarded" | "failed";
export type InviteStatus = "invited" | "simulated" | "failed";

export interface Candidate {
  firstName: string;
  lastName: string;
  email: string;
}

export interface Offer {
  id: string;
  token: string;
  jobTitle: string;
  jobFamily: JobFamily;
  teamKey: string;
  teamName: string;
  lineManagerKey: string;
  lineManagerName: string;
  startDate: string;
  conditions: string[];
  salary: string;
  status: OfferStatus;
  createdAt: string;
  expiresAt: string;
  candidate?: Candidate;
  acceptedAt?: string;
  inviteAt?: string;
  onboardedAt?: string;
  guestObjectId?: string | null;
  inviteStatus?: InviteStatus;
  journeyId?: string;
  error?: string;
}

export const OFFER_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const dataDir = () => process.env.MOCK_WORKDAY_DATA_DIR || path.join(process.cwd(), ".data");
/** Rehearsal reset: removes the whole data dir (same as `npm run reset`). */
export async function purgeData(): Promise<void> {
  await (g.__wdQueue ?? Promise.resolve());
  await rm(dataDir(), { recursive: true, force: true });
}

const file = () => path.join(dataDir(), "offers.json");

const g = globalThis as unknown as { __wdQueue?: Promise<unknown> };

async function read(): Promise<Offer[]> {
  try {
    const parsed = JSON.parse(await readFile(file(), "utf8")) as { offers?: Offer[] };
    return Array.isArray(parsed.offers) ? parsed.offers : [];
  } catch {
    return [];
  }
}

async function write(offers: Offer[]): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
  const tmp = `${file()}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify({ offers }, null, 2), { mode: 0o600 });
  await rename(tmp, file());
}

/** Runs `fn` against the current offers, serialised; persists the (possibly mutated) list when `fn` returns a value. */
function tx<T>(fn: (offers: Offer[]) => T | Promise<T>): Promise<T> {
  const run = (g.__wdQueue ?? Promise.resolve()).then(async () => {
    const offers = await read();
    const result = await fn(offers);
    await write(offers);
    return result;
  });
  g.__wdQueue = run.catch(() => undefined);
  return run;
}

export const newToken = () => randomBytes(24).toString("base64url");
const newId = () => `wd-offer-${randomBytes(6).toString("hex")}`;

export interface CreateOfferInput extends OfferInput {
  teamName: string;
  lineManagerName: string;
}

export function createOffer(input: CreateOfferInput, now: Date = new Date()): Promise<Offer> {
  const offer: Offer = {
    id: newId(),
    token: newToken(),
    jobTitle: input.jobTitle,
    jobFamily: input.jobFamily,
    teamKey: input.teamKey,
    teamName: input.teamName,
    lineManagerKey: input.lineManagerKey,
    lineManagerName: input.lineManagerName,
    startDate: input.startDate,
    conditions: input.conditions,
    salary: "£XX,XXX (example)",
    status: "sent",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + OFFER_TTL_MS).toISOString(),
  };
  return tx((offers) => {
    offers.push(offer);
    return offer;
  });
}

export const listOffers = async (): Promise<Offer[]> => (await read()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const getOfferById = async (id: string): Promise<Offer | null> => (await read()).find((o) => o.id === id) ?? null;
export async function getOfferByToken(token: string): Promise<Offer | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return (await read()).find((o) => o.token === token) ?? null;
}

export type AcceptResult = { ok: true; offer: Offer } | { ok: false; reason: "not_found" | "used" | "expired" };

/** One acceptance per token. */
export function acceptOffer(token: string, candidate: Candidate, now: Date = new Date()): Promise<AcceptResult> {
  return tx((offers): AcceptResult => {
    const o = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? offers.find((x) => x.token === token) : undefined;
    if (!o) return { ok: false, reason: "not_found" };
    if (o.status !== "sent" || o.candidate) return { ok: false, reason: "used" };
    if (Date.parse(o.expiresAt) < now.getTime()) return { ok: false, reason: "expired" };
    o.candidate = candidate;
    o.acceptedAt = now.toISOString();
    o.status = "accepted_pending_invite";
    return { ok: true, offer: { ...o } };
  });
}

export function updateOffer(id: string, patch: (o: Offer) => void): Promise<Offer | null> {
  return tx((offers) => {
    const o = offers.find((x) => x.id === id);
    if (!o) return null;
    patch(o);
    return { ...o };
  });
}

/** Records the invite result from the recruiter's browser (guest id and status only). */
export function recordInvite(id: string, r: { guestObjectId: string | null; inviteStatus: InviteStatus; error?: string }) {
  return updateOffer(id, (o) => {
    if (o.status !== "accepted_pending_invite" && o.status !== "failed") return;
    o.guestObjectId = r.guestObjectId;
    o.inviteAt = new Date().toISOString();
    o.inviteStatus = r.inviteStatus;
    if (r.inviteStatus === "failed") {
      o.status = "failed";
      o.error = r.error ?? "Invite failed";
    } else {
      o.status = r.inviteStatus === "invited" ? "invite_sent" : "invite_simulated";
      o.error = undefined;
    }
  });
}

export const markOnboarded = (id: string, journeyId: string) =>
  updateOffer(id, (o) => {
    o.status = "onboarded";
    o.onboardedAt = new Date().toISOString();
    o.journeyId = journeyId;
    o.error = undefined;
  });

export const markFailed = (id: string, error: string) =>
  updateOffer(id, (o) => {
    o.status = "failed";
    o.error = error;
  });

/** Failed -> retry. Without a recorded invite we go back to the invite step; otherwise only the webhook is retried. */
export const resetForRetry = (id: string) =>
  updateOffer(id, (o) => {
    if (o.status !== "failed") return;
    o.error = undefined;
    if (o.inviteStatus === "invited" || o.inviteStatus === "simulated") o.status = o.inviteStatus === "invited" ? "invite_sent" : "invite_simulated";
    else {
      o.status = "accepted_pending_invite";
      o.inviteStatus = undefined;
    }
  });

/** Public (candidate-facing) view: never includes anyone else's data, nor the candidate's email. */
export function candidateView(o: Offer) {
  const phase = o.status === "sent" ? "open" : o.status === "accepted_pending_invite" || o.status === "failed" ? "setting_up" : o.inviteStatus === "simulated" ? "simulated" : "invited";
  return {
    jobTitle: o.jobTitle,
    jobFamily: o.jobFamily,
    teamName: o.teamName,
    lineManagerName: o.lineManagerName,
    startDate: o.startDate,
    conditions: o.conditions,
    salary: o.salary,
    firstName: o.candidate?.firstName ?? null,
    expired: o.status === "sent" && Date.parse(o.expiresAt) < Date.now(),
    phase,
  };
}
