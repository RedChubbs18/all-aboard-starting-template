/**
 * D39: when a starter reaches UNCONDITIONAL_OFFER, convert their Entra B2B guest account into a standard internal
 * member account (same object id, so the `entraOid` sign-in mapping keeps working) and email the new work sign-in
 * details to their personal address.
 *
 *  - The personal email is read from Graph at conversion time and used for that one email. It is NEVER stored or logged.
 *  - The temporary password exists only in memory for the request. It is never stored, evented or logged.
 *  - Without the Graph config (graphConfig() === null) nothing is called: the run is SIMULATED and recorded.
 *  - Only `team05-` test accounts that are externally authenticated guests are ever touched.
 *
 * IntegrationState `identity` holds the outcome (no secrets): converted | conversion_failed | conversion_simulated.
 */
import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { GraphError, graphConfig, graphRequest, redactEmails, type GraphConfig } from "./graph-app";
import { loadJourney, recordEvent } from "./journey-service";
import { reconcileSystemTasks } from "./integration-service";
import { stageIndex } from "@/domain/types";

export const TEAM_PREFIX = "team05-";
const ADAPTER_KEY = "identity";
const GRAPH = "https://graph.microsoft.com";

export type ConversionOutcome =
  | { status: "converted"; upn: string; emailSent: boolean }
  | { status: "already_converted"; upn: string | null }
  | { status: "simulated"; upn: string }
  | { status: "failed"; code: string; message: string }
  | { status: "refused"; reason: string }
  | { status: "in_progress" };

export interface ConvertOptions {
  actorId?: string | null;
  trigger?: "stage" | "manual";
  /** Test seam; defaults to the environment. */
  config?: GraphConfig | null;
}

// ------------------------------------------------------------------ helpers

/** `team05-jo-bloggs` from any display name: lower case, accents folded, a-z 0-9 and single hyphens only. */
export function memberLocalPart(displayName: string): string {
  const slug = displayName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const rest = slug.startsWith("team05-") ? slug.slice("team05-".length) : slug.replace(/^team05$/, "");
  return `${TEAM_PREFIX}${rest || "starter"}`.slice(0, 60).replace(/-+$/, "");
}

/** First candidate has no suffix; later ones add `-2`, `-3`, ... */
export const candidateUpn = (displayName: string, domain: string, attempt: number) =>
  `${memberLocalPart(displayName)}${attempt <= 1 ? "" : `-${attempt}`}@${domain}`;

const isConflict = (e: unknown) =>
  e instanceof GraphError && (e.status === 409 || (e.status === 400 && /already|same value|not unique|another object|in use|conflict/i.test(`${e.code} ${e.message}`)));

/** 20 characters, all four classes (Entra complexity), no look-alike characters. */
export function generateTempPassword(): string {
  const sets = ["ABCDEFGHJKMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "#%+=?@"];
  const all = sets.join("");
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < 20) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const appUrl = () => (process.env.NEXT_PUBLIC_MYJOURNEY_PUBLIC_URL || "http://localhost:3000").trim();

export function welcomeEmail(firstName: string, upn: string, password: string, url: string) {
  return {
    subject: "You're now a Lloyds Banking Group colleague",
    html:
      `<p>Hello ${esc(firstName)},</p>` +
      `<p><strong>You're now a Lloyds Banking Group colleague.</strong> Your work account is ready.</p>` +
      `<p>Work sign-in name: <strong>${esc(upn)}</strong><br>Temporary password: <strong>${esc(password)}</strong></p>` +
      `<p>When you sign in you'll be asked to change this password and set up the Microsoft Authenticator app.</p>` +
      `<p>Then continue your onboarding in MyJourney: <a href="${esc(url)}">${esc(url)}</a></p>` +
      `<p>Please delete this email once you have changed your password.</p>`,
  };
}

interface GraphUser {
  id?: string;
  displayName?: string;
  userType?: string;
  mail?: string | null;
  otherMails?: string[];
  userPrincipalName?: string;
  externalUserState?: string | null;
  creationType?: string | null;
}

interface StateRow { status: string; payload: Record<string, unknown> }

async function readState(journeyId: string): Promise<StateRow | null> {
  const r = await prisma.integrationState.findUnique({ where: { journeyId_adapterKey: { journeyId, adapterKey: ADAPTER_KEY } } });
  return r ? { status: r.status, payload: (r.payload as Record<string, unknown> | null) ?? {} } : null;
}

/** Merges into the existing identity payload (invitedAt, guestObjectId, ... are kept). Payload never holds secrets. */
async function writeState(journeyId: string, status: string, patch: Record<string, unknown>): Promise<void> {
  const cur = await readState(journeyId);
  const payload = { ...(cur?.payload ?? {}), ...patch } as Prisma.InputJsonObject;
  await prisma.integrationState.upsert({
    where: { journeyId_adapterKey: { journeyId, adapterKey: ADAPTER_KEY } },
    create: { journeyId, adapterKey: ADAPTER_KEY, status, payload },
    update: { status, payload },
  });
}

const inFlight = new Map<string, Promise<ConversionOutcome>>();

// --------------------------------------------------------------------- main

/** Idempotent and retry-safe. Never throws: failures are recorded as `conversion_failed`. */
export function convertStarterToMember(journeyId: string, opts: ConvertOptions = {}): Promise<ConversionOutcome> {
  const running = inFlight.get(journeyId);
  if (running) return Promise.resolve({ status: "in_progress" });
  const p = run(journeyId, opts)
    .catch(async (e): Promise<ConversionOutcome> => {
      const code = e instanceof GraphError ? e.code : "unexpected_error";
      const message = redactEmails(e instanceof Error ? e.message : "Unexpected error");
      console.error("[identity-conversion] failed:", code);
      return failed(journeyId, opts, code, message);
    })
    .finally(() => inFlight.delete(journeyId));
  inFlight.set(journeyId, p);
  return p;
}

async function failed(journeyId: string, opts: ConvertOptions, code: string, message: string): Promise<ConversionOutcome> {
  try {
    await writeState(journeyId, "conversion_failed", { failedAt: new Date().toISOString(), errorCode: code, errorMessage: message });
    await recordEvent({ journeyId, actorId: opts.actorId ?? null, type: "GUEST_CONVERSION_FAILED", entity: "Integration", entityId: ADAPTER_KEY, data: { code, message } });
  } catch (e) {
    console.error("[identity-conversion] could not record failure:", e instanceof Error ? e.name : "error");
  }
  return { status: "failed", code, message };
}

async function run(journeyId: string, opts: ConvertOptions): Promise<ConversionOutcome> {
  const journey = await loadJourney(journeyId);
  if (!journey) return { status: "refused", reason: "Journey not found" };
  if (journey.status !== "active") return { status: "refused", reason: "Journey is not active" };
  if (stageIndex(journey.currentStage) < stageIndex("UNCONDITIONAL_OFFER") && opts.trigger !== "manual") return { status: "refused", reason: "Not yet at unconditional offer" };

  const existing = await readState(journeyId);
  if (existing?.status === "converted") return { status: "already_converted", upn: (existing.payload.upn as string | undefined) ?? null };

  // Database-side guard: a STARTER with an Entra object id and a team05- name.
  const starter = await prisma.user.findUnique({ where: { id: journey.starterId } });
  const roles = Array.isArray(starter?.roles) ? (starter!.roles as unknown[]).map(String) : [];
  if (!starter || !roles.includes("STARTER")) return { status: "refused", reason: "Not a starter" };
  if (!starter.entraOid) return { status: "refused", reason: "Starter has not signed in with Entra yet" };
  if (!starter.displayName.toLowerCase().startsWith(TEAM_PREFIX)) return { status: "refused", reason: "Only team05 test accounts are converted" };

  const cfg = opts.config === undefined ? graphConfig() : opts.config;
  if (!cfg) {
    // Simulate: no Graph call. Record what would happen so the UI can show it.
    const upn = candidateUpn(starter.displayName, process.env.MEMBER_UPN_DOMAIN?.trim().replace(/^@/, "") || "member.example.test", 1);
    await writeState(journeyId, "conversion_simulated", { simulatedAt: new Date().toISOString(), wouldConvertTo: upn });
    await recordEvent({ journeyId, actorId: opts.actorId ?? null, type: "GUEST_CONVERSION_SIMULATED", entity: "Integration", entityId: ADAPTER_KEY, data: { wouldConvertTo: upn, reason: "Guest conversion is not configured" } });
    return { status: "simulated", upn };
  }

  const oid = starter.entraOid;
  const guest = await graphRequest<GraphUser>(
    cfg, "GET",
    `${GRAPH}/v1.0/users/${encodeURIComponent(oid)}?$select=id,displayName,userType,mail,otherMails,userPrincipalName,externalUserState,creationType`,
  );
  if (!guest || guest.id !== oid) return failed(journeyId, opts, "user_not_found", "The Entra user could not be read");
  // Graph-side guard: an externally authenticated guest whose own name is a team05- test name.
  if (guest.userType !== "Guest" || !(guest.creationType === "Invitation" || guest.externalUserState)) return { status: "refused", reason: "Entra user is not an externally authenticated guest" };
  if (!(guest.displayName ?? "").toLowerCase().startsWith(TEAM_PREFIX)) return { status: "refused", reason: "Only team05 test accounts are converted" };

  // Read now, used once for the email, never stored or logged. Without it the password could not be delivered.
  const personalEmail = [guest.mail, ...(guest.otherMails ?? [])].find((m): m is string => !!m && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m));
  if (!personalEmail) return failed(journeyId, opts, "no_personal_email", "The guest has no personal email address to send the sign-in details to");

  const password = generateTempPassword();
  let upn = "";
  let attempt = 1;
  for (;;) {
    const candidate = candidateUpn(guest.displayName!, cfg.memberDomain, attempt);
    try {
      const r = await graphRequest<{ userPrincipalName?: string }>(cfg, "POST", `${GRAPH}/beta/users/${encodeURIComponent(oid)}/convertExternalToInternalMemberUser`, {
        userPrincipalName: candidate,
        passwordProfile: { password, forceChangePasswordNextSignIn: true },
      });
      upn = r?.userPrincipalName || candidate;
      break;
    } catch (e) {
      if (isConflict(e) && attempt < 6) { attempt++; continue; }
      throw e;
    }
  }

  // The user is now a member: record that BEFORE anything else can fail, so a retry never converts twice.
  const convertedAt = new Date().toISOString();
  await writeState(journeyId, "converted", { upn, convertedAt, emailSent: false, conditionalAccess: "pre-start", errorCode: null, errorMessage: null });
  await prisma.user.update({ where: { id: starter.id }, data: { upn } }).catch((e) => console.error("[identity-conversion] could not update the stored UPN:", e instanceof Error ? e.name : "error"));
  await recordEvent({ journeyId, actorId: opts.actorId ?? null, type: "GUEST_CONVERTED_TO_MEMBER", entity: "Integration", entityId: ADAPTER_KEY, data: { upn } });
  await reconcileSystemTasks(journeyId, { actorId: opts.actorId ?? null }).catch((e) => console.error("[identity-conversion] task reconcile failed:", e instanceof Error ? e.name : "error"));

  let emailSent = false;
  try {
    const first = (guest.displayName ?? "").slice(TEAM_PREFIX.length).split("-")[0] || "there";
    const mail = welcomeEmail(first.charAt(0).toUpperCase() + first.slice(1), upn, password, appUrl());
    await graphRequest(cfg, "POST", `${GRAPH}/v1.0/users/${encodeURIComponent(cfg.senderUpn)}/sendMail`, {
      message: { subject: mail.subject, body: { contentType: "HTML", content: mail.html }, toRecipients: [{ emailAddress: { address: personalEmail } }] },
      saveToSentItems: false,
    });
    emailSent = true;
    await writeState(journeyId, "converted", { emailSent: true, emailSentAt: new Date().toISOString() });
    await recordEvent({ journeyId, actorId: opts.actorId ?? null, type: "MEMBER_WELCOME_EMAIL_SENT", entity: "Integration", entityId: ADAPTER_KEY, data: { upn } });
  } catch (e) {
    const code = e instanceof GraphError ? e.code : "email_failed";
    const message = redactEmails(e instanceof Error ? e.message : "Email failed");
    console.error("[identity-conversion] welcome email failed:", code);
    await writeState(journeyId, "converted", { emailSent: false, emailErrorCode: code, emailErrorMessage: message }).catch(() => undefined);
    await recordEvent({ journeyId, actorId: opts.actorId ?? null, type: "MEMBER_WELCOME_EMAIL_FAILED", entity: "Integration", entityId: ADAPTER_KEY, data: { code, message } }).catch(() => undefined);
  }
  return { status: "converted", upn, emailSent };
}

// ------------------------------------------------------------------ status

export type WorkAccountState = "none" | "pending" | "simulated" | "converted" | "failed";

export interface WorkAccountStatus {
  state: WorkAccountState;
  upn: string | null;
  /** ISO time of the conversion, simulation or failure. */
  at: string | null;
  emailSent: boolean | null;
  error: string | null;
}

/** Summary for the UI. Secrets and the personal email are never part of it (they are never stored). */
export async function getWorkAccountStatus(journeyId: string): Promise<WorkAccountStatus> {
  const [row, j] = await Promise.all([readState(journeyId), prisma.journey.findUnique({ where: { id: journeyId }, select: { currentStage: true, starterId: true } })]);
  const p = row?.payload ?? {};
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : null);
  if (row?.status === "converted") return { state: "converted", upn: str("upn"), at: str("convertedAt"), emailSent: p.emailSent === true, error: str("emailErrorMessage") };
  if (row?.status === "conversion_failed") return { state: "failed", upn: null, at: str("failedAt"), emailSent: null, error: [str("errorCode"), str("errorMessage")].filter(Boolean).join(": ") || "Unknown error" };
  if (row?.status === "conversion_simulated") return { state: "simulated", upn: str("wouldConvertTo"), at: str("simulatedAt"), emailSent: null, error: null };
  if (j && stageIndex(j.currentStage as never) >= stageIndex("UNCONDITIONAL_OFFER")) {
    const u = await prisma.user.findUnique({ where: { id: j.starterId }, select: { entraOid: true, displayName: true } });
    if (u?.entraOid && u.displayName.toLowerCase().startsWith(TEAM_PREFIX)) return { state: "pending", upn: null, at: null, emailSent: null, error: null };
  }
  return { state: "none", upn: null, at: null, emailSent: null, error: null };
}
