import { signedHeaders } from "./hmac";
import type { JobFamily } from "./jobFamily";
import type { InviteStatus, Offer } from "./store";

export interface WebhookPayload {
  offerId: string;
  candidate: { firstName: string; lastName: string };
  jobTitle: string;
  jobFamily: JobFamily;
  teamKey: string;
  lineManagerKey: string;
  startDate: string;
  conditions: string[];
  guest: { objectId: string | null; inviteStatus: InviteStatus };
}

/** Builds the contract body from an explicit field list, so the personal email can never leak into it. */
export function buildWebhookPayload(o: Offer, guest: { objectId: string | null; inviteStatus: InviteStatus }): WebhookPayload {
  if (!o.candidate) throw new Error("Offer has no candidate");
  return {
    offerId: o.id,
    candidate: { firstName: o.candidate.firstName, lastName: o.candidate.lastName },
    jobTitle: o.jobTitle,
    jobFamily: o.jobFamily,
    teamKey: o.teamKey,
    lineManagerKey: o.lineManagerKey,
    startDate: o.startDate,
    conditions: [...o.conditions],
    guest: { objectId: guest.objectId, inviteStatus: guest.inviteStatus },
  };
}

export interface SendOptions {
  fetch: typeof fetch;
  baseUrl: string;
  secret: string;
  payload: WebhookPayload;
  /** Total attempts (default 4) and the backoff base in ms (default 500, doubling). */
  attempts?: number;
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export type WebhookResult = { ok: true; journeyId: string; starterId?: string } | { ok: false; error: string; status?: number };

/** POSTs the offer-accepted webhook (HMAC signed). Retries 5xx and network errors with backoff, not 4xx. Never throws. */
export async function sendOfferAccepted(o: SendOptions): Promise<WebhookResult> {
  const attempts = o.attempts ?? 4;
  const base = o.backoffMs ?? 500;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const body = JSON.stringify(o.payload);
  const url = `${o.baseUrl.replace(/\/$/, "")}/api/integrations/workday/offer-accepted`;
  let last: WebhookResult = { ok: false, error: "No attempt made" };
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(base * 2 ** (i - 1));
    try {
      const res = await o.fetch(url, { method: "POST", headers: { "content-type": "application/json", ...signedHeaders(o.secret, body) }, body });
      if (res.ok) {
        const j = (await res.json().catch(() => ({}))) as { journeyId?: string; starterId?: string };
        if (j.journeyId) return { ok: true, journeyId: j.journeyId, starterId: j.starterId };
        last = { ok: false, error: "MyJourney response had no journeyId", status: res.status };
        continue;
      }
      last = { ok: false, error: `MyJourney returned ${res.status}`, status: res.status };
      if (res.status >= 400 && res.status < 500) return last;
    } catch {
      last = { ok: false, error: "Could not reach MyJourney" };
    }
  }
  return last;
}

export interface Directory {
  teams: { key: string; name: string; businessArea?: string; lineManagers: { key: string; name: string }[] }[];
}

/** Signed GET of MyJourney's directory (empty body, signature over "<ts>."). */
export async function fetchDirectory(o: { fetch: typeof fetch; baseUrl: string; secret: string }): Promise<Directory> {
  const res = await o.fetch(`${o.baseUrl.replace(/\/$/, "")}/api/integrations/workday/directory`, { headers: signedHeaders(o.secret, ""), cache: "no-store" });
  if (!res.ok) throw new Error(`Directory request failed (${res.status})`);
  const j = (await res.json()) as Directory;
  if (!Array.isArray(j.teams)) throw new Error("Unexpected directory response");
  return j;
}
