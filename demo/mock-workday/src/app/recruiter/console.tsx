"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "@/lib/msal";
import { runInvite } from "@/lib/graph";
import type { Directory } from "@/lib/webhook";

interface OfferRow {
  id: string;
  token: string;
  jobTitle: string;
  teamName: string;
  lineManagerName: string;
  startDate: string;
  status: "sent" | "accepted_pending_invite" | "invite_sent" | "invite_simulated" | "onboarded" | "failed";
  candidate?: { firstName: string; lastName: string; email?: string };
  journeyId?: string;
  error?: string;
  createdAt: string;
}

const CONDITION_OPTIONS = [
  "Satisfactory pre-employment vetting",
  "References",
  "Right to work in the UK",
  "Satisfactory completion of a health declaration",
];
const DEFAULT_CONDITIONS = new Set(CONDITION_OPTIONS.slice(0, 2));

const STATUS_STYLE: Record<OfferRow["status"], string> = {
  sent: "bg-slate-200 text-slate-900",
  accepted_pending_invite: "bg-amber-200 text-amber-950",
  invite_sent: "bg-blue-200 text-blue-950",
  invite_simulated: "bg-violet-200 text-violet-950",
  onboarded: "bg-green-200 text-green-950",
  failed: "bg-red-200 text-red-950",
};

const approved = () => process.env.NEXT_PUBLIC_GRAPH_INVITE_EXTERNAL_APPROVED === "yes";
const publicUrl = () => process.env.NEXT_PUBLIC_MYJOURNEY_PUBLIC_URL || "http://localhost:3000";
const offerBase = () => process.env.NEXT_PUBLIC_OFFER_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3001");
const offerLink = (token: string) => `${offerBase().replace(/\/$/, "")}/offer/${token}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function defaultStart(): string {
  const d = new Date(Date.now() + 56 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export default function Console() {
  const auth = useAuth();
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [dirError, setDirError] = useState<string | null>(null);
  const [log, setLog] = useState<{ id: number; t: string; msg: string }[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<OfferRow | null>(null);
  const processing = useRef(new Set<string>());
  const logId = useRef(0);

  const say = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString("en-GB");
    setLog((l) => [{ id: ++logId.current, t, msg }, ...l].slice(0, 50));
  }, []);

  const loadOffers = useCallback(async (): Promise<OfferRow[]> => {
    const r = await auth.apiFetch("/api/recruiter/offers");
    if (!r.ok) throw new Error(`offers ${r.status}`);
    const list = ((await r.json()) as { offers: OfferRow[] }).offers;
    setOffers(list);
    return list;
  }, [auth]);

  const postWithBackoff = useCallback(
    async (path: string, body: unknown) => {
      for (let i = 0; i < 4; i++) {
        if (i > 0) {
          say(`Retrying in ${2 ** (i - 1)}s…`);
          await sleep(1000 * 2 ** (i - 1));
        }
        try {
          const r = await auth.apiFetch(path, { method: "POST", body: JSON.stringify(body) });
          if (r.ok || (r.status >= 400 && r.status < 500)) return r;
        } catch {
          /* network: retry */
        }
      }
      return null;
    },
    [auth, say],
  );

  const processOffer = useCallback(
    async (o: OfferRow) => {
      const c = o.candidate;
      if (!c?.email) return;
      const name = `${c.firstName} ${c.lastName}`;
      say(`${name} accepted the offer for ${o.jobTitle}.`);
      say(approved() ? "Sending a real Microsoft Entra guest invitation…" : "External invites are not approved here: simulating the invitation (no Graph call).");
      const outcome = await runInvite({
        fetch,
        getToken: auth.acquireInviteToken,
        approved: approved(),
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        redirectUrl: publicUrl(),
      });
      let payload: { inviteStatus: string; guestObjectId?: string; error?: string };
      if (outcome.status === "invited") {
        say("Guest invited. Microsoft is emailing the candidate.");
        payload = { inviteStatus: "invited", guestObjectId: outcome.guestObjectId };
      } else if (outcome.status === "simulated") {
        say(`Invite simulated: ${outcome.message}`);
        setPreviews((p) => ({ ...p, [o.id]: outcome.message }));
        payload = { inviteStatus: "simulated" };
      } else {
        say(`Invite failed: ${outcome.error}`);
        payload = { inviteStatus: "failed", error: outcome.error };
      }
      say("Telling MyJourney to start the journey…");
      const r = await postWithBackoff(`/api/recruiter/offers/${o.id}/invite-result`, payload);
      if (!r || !r.ok) say("Could not record the result. Use Retry on the offer.");
      else {
        const j = (await r.json()) as { offer: OfferRow | null };
        if (j.offer?.status === "onboarded") say("MyJourney created the starter and their journey. Done.");
        else if (j.offer?.status === "failed") say(`MyJourney step failed: ${j.offer.error ?? "unknown"}. Use Retry.`);
      }
    },
    [auth.acquireInviteToken, postWithBackoff, say],
  );

  // Directory for the create form.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await auth.apiFetch("/api/recruiter/directory");
      if (cancelled) return;
      if (r.ok) setDirectory((await r.json()) as Directory);
      else setDirError(((await r.json().catch(() => ({}))) as { message?: string }).message ?? `Could not load teams (${r.status})`);
    })().catch(() => !cancelled && setDirError("Could not load teams."));
    return () => {
      cancelled = true;
    };
  }, [auth]);

  // Auto-invite loop: poll every 3s, process each accepted offer once at a time.
  const tick = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    tick.current = async () => {
      const list = await loadOffers();
      for (const o of list) {
        if (o.status !== "accepted_pending_invite" || processing.current.has(o.id)) continue;
        processing.current.add(o.id);
        try {
          await processOffer(o);
          await loadOffers();
        } finally {
          processing.current.delete(o.id);
        }
      }
    };
  }, [loadOffers, processOffer]);
  useEffect(() => {
    let stopped = false;
    let busy = false;
    const run = async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        await tick.current();
      } catch {
        /* transient: next tick */
      } finally {
        busy = false;
      }
    };
    void run();
    const h = setInterval(run, 3000);
    return () => {
      stopped = true;
      clearInterval(h);
    };
  }, []);

  async function retry(id: string) {
    say("Retrying…");
    const r = await auth.apiFetch(`/api/recruiter/offers/${id}/retry`, { method: "POST" });
    if (!r.ok) say("Retry was refused.");
    await loadOffers().catch(() => {});
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Recruiter console</h1>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>{approved() ? "Real Entra invites ON" : "Invites simulated"}</span>
          <button onClick={() => void auth.signOut()} className="rounded border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50">
            Sign out
          </button>
        </div>
      </div>

      <CreateOffer
        directory={directory}
        dirError={dirError}
        onCreate={async (input) => {
          const r = await auth.apiFetch("/api/recruiter/offers", { method: "POST", body: JSON.stringify(input) });
          const j = (await r.json().catch(() => ({}))) as { offer?: OfferRow; message?: string };
          if (!r.ok || !j.offer) return j.message ?? `Could not create the offer (${r.status})`;
          setCreated(j.offer);
          say(`Offer created for ${j.offer.jobTitle}. Waiting for the candidate to accept.`);
          await loadOffers().catch(() => {});
          return null;
        }}
      />

      {created && <LinkCard offer={created} />}

      <section aria-labelledby="offers-h" className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 id="offers-h" className="text-lg font-semibold">
          Offers
        </h2>
        {offers.length === 0 ? (
          <p className="mt-2 text-slate-600">No offers yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200">
            {offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {o.jobTitle} <span className="font-normal text-slate-600">· {o.teamName}</span>
                  </p>
                  <p className="text-sm text-slate-600">
                    {o.candidate ? `${o.candidate.firstName} ${o.candidate.lastName}` : "Awaiting candidate"} · LM {o.lineManagerName} · starts {o.startDate}
                  </p>
                  {o.status === "invite_simulated" && previews[o.id] && <p className="mt-1 text-sm text-violet-900">Invite simulated: {previews[o.id].slice(0, 140)}…</p>}
                  {o.status === "failed" && <p className="mt-1 text-sm text-red-800">{o.error}</p>}
                  {o.status === "sent" && (
                    <button onClick={() => setCreated(o)} className="mt-1 text-sm text-blue-800 underline">
                      Show link
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[o.status]}`}>{o.status}</span>
                  {o.status === "failed" && (
                    <button onClick={() => void retry(o.id)} className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50">
                      Retry
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="log-h" className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 id="log-h" className="text-lg font-semibold">
          Activity
        </h2>
        <ol aria-live="polite" className="mt-3 space-y-1 font-mono text-sm text-slate-800">
          {log.length === 0 && <li className="text-slate-500">Waiting for activity. Keep this page open: it sends invitations automatically.</li>}
          {log.map((l) => (
            <li key={l.id}>
              <span className="text-slate-500">{l.t}</span> {l.msg}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function CreateOffer({
  directory,
  dirError,
  onCreate,
}: {
  directory: Directory | null;
  dirError: string | null;
  onCreate: (i: { jobTitle: string; teamKey: string; lineManagerKey: string; startDate: string; conditions: string[] }) => Promise<string | null>;
}) {
  const [jobTitle, setJobTitle] = useState("Software Engineer");
  const [teamKey, setTeamKey] = useState("");
  const [lmKey, setLmKey] = useState("");
  const [startDate, setStartDate] = useState(defaultStart);
  const [conds, setConds] = useState<Set<string>>(new Set(DEFAULT_CONDITIONS));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const team = directory?.teams.find((t) => t.key === teamKey) ?? directory?.teams[0];
  const effTeam = team?.key ?? "";
  const lms = team?.lineManagers ?? [];
  const effLm = lms.find((m) => m.key === lmKey)?.key ?? lms[0]?.key ?? "";

  const field = "mt-1 w-full rounded border border-slate-400 bg-white px-3 py-2";
  return (
    <form
      className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const m = await onCreate({ jobTitle, teamKey: effTeam, lineManagerKey: effLm, startDate, conditions: CONDITION_OPTIONS.filter((c) => conds.has(c)) });
        setErr(m);
        setBusy(false);
      }}
    >
      <h2 className="text-lg font-semibold">Create conditional offer</h2>
      {dirError && (
        <p role="alert" className="mt-2 text-red-800">
          {dirError}
        </p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Job title
          <input className={field} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required maxLength={100} />
        </label>
        <label className="block text-sm font-medium">
          Start date
          <input type="date" className={field} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </label>
        <label className="block text-sm font-medium">
          Team
          <select className={field} value={effTeam} onChange={(e) => { setTeamKey(e.target.value); setLmKey(""); }} required>
            {directory?.teams.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            )) ?? <option value="">Loading…</option>}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Line manager
          <select className={field} value={effLm} onChange={(e) => setLmKey(e.target.value)} required>
            {lms.map((m) => (
              <option key={m.key} value={m.key}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Conditions of the offer</legend>
        {CONDITION_OPTIONS.map((c) => (
          <label key={c} className="mt-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={conds.has(c)}
              onChange={(e) => {
                const n = new Set(conds);
                if (e.target.checked) n.add(c);
                else n.delete(c);
                setConds(n);
              }}
            />
            {c}
          </label>
        ))}
      </fieldset>
      {err && (
        <p role="alert" className="mt-3 text-red-800">
          {err}
        </p>
      )}
      <button disabled={busy || !effTeam || !effLm} className="mt-5 rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-50">
        {busy ? "Creating…" : "Create offer"}
      </button>
    </form>
  );
}

function LinkCard({ offer }: { offer: OfferRow }) {
  const link = offerLink(offer.token);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let c = false;
    QRCode.toDataURL(link, { margin: 1, width: 192 }).then((u) => !c && setQr(u)).catch(() => {});
    return () => {
      c = true;
    };
  }, [link]);
  return (
    <section aria-labelledby="link-h" className="rounded-lg border border-blue-200 bg-blue-50 p-6">
      <h2 id="link-h" className="text-lg font-semibold">
        Candidate link for {offer.jobTitle}
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-6">
        <div className="min-w-0 flex-1">
          <p className="break-all rounded border border-slate-300 bg-white p-2 font-mono text-sm">{link}</p>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(link).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="mt-2 rounded bg-blue-700 px-3 py-1 text-sm font-medium text-white hover:bg-blue-800"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <p className="mt-2 text-sm text-slate-600">Scan the code to open the offer on a phone (the phone must reach this computer).</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr && <img src={qr} alt="QR code for the candidate offer link" width={192} height={192} className="rounded border border-slate-300 bg-white" />}
      </div>
    </section>
  );
}
