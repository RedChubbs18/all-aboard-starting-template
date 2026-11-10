"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { isLocalUrl } from "@/lib/publicUrl";
import type { Directory } from "@/lib/webhook";
import { JOB_FAMILIES, JOB_FAMILY_LABELS, type JobFamily } from "@/lib/jobFamily";
import { randomMonday, startDateError } from "@/lib/startDate";

interface OfferRow {
  id: string;
  token: string;
  jobTitle: string;
  jobFamily: JobFamily;
  teamName: string;
  lineManagerName: string;
  startDate: string;
  status: "sent" | "accepted_pending_invite" | "invite_sent" | "invite_simulated" | "onboarded" | "failed";
  candidate?: { firstName: string; lastName: string };
  events?: { at: string; msg: string }[];
  /** Fallback invitation link: sent by the server to this console only. */
  redeemUrl?: string;
  journeyId?: string;
  error?: string;
  createdAt: string;
  inviteStatus?: "invited" | "simulated" | "failed";
  acceptedAt?: string;
  inviteAt?: string;
  onboardedAt?: string;
}

const CONDITION_OPTIONS = [
  "Satisfactory pre-employment vetting",
  "References",
  "Right to work in the UK",
  "Satisfactory completion of a health declaration",
];
/** "Fill demo offer" targets (Team 05 pitch): the team and line manager the demo journey lands with. */
const DEMO_TEAM_NAME = "Digital Workplace Engineering";
const DEMO_LM_NAME = "Dana Sample";
const DEFAULT_CONDITIONS = new Set(CONDITION_OPTIONS.slice(0, 2));

const STATUS_STYLE: Record<OfferRow["status"], string> = {
  sent: "bg-slate-200 text-slate-900",
  accepted_pending_invite: "bg-amber-200 text-amber-950",
  invite_sent: "bg-blue-200 text-blue-950",
  invite_simulated: "bg-violet-200 text-violet-950",
  onboarded: "bg-green-200 text-green-950",
  failed: "bg-red-200 text-red-950",
};

const offerBase = () => process.env.NEXT_PUBLIC_OFFER_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3001");
const offerLink = (token: string) => `${offerBase().replace(/\/$/, "")}/offer/${token}`;

interface Meta {
  invites: "real" | "simulated" | "simulated_no_credentials";
  myJourneyPublicUrl: string;
}
const PIN_KEY = "mock-workday-recruiter-pin";

const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null);
const fmtDay = (d: string) => {
  const dt = new Date(`${d}T12:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

function Timeline({ o }: { o: OfferRow }) {
  const accepted = o.status !== "sent";
  const invited = o.status === "invite_sent" || o.status === "invite_simulated" || o.status === "onboarded" || (o.status === "failed" && !!o.inviteAt && o.inviteStatus !== "failed");
  const steps = [
    { label: "Offer created", at: o.createdAt, done: true },
    { label: "Offer accepted", at: o.acceptedAt, done: accepted },
    { label: o.status === "invite_simulated" ? "Invite simulated" : "Invite sent", at: o.inviteAt, done: invited },
    { label: "MyJourney journey created", at: o.onboardedAt, done: o.status === "onboarded" },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="mt-3 grid gap-2 sm:grid-cols-4" aria-label="Offer progress">
      {steps.map((s, i) => {
        const failedHere = o.status === "failed" && i === current;
        return (
          <li
            key={s.label}
            className={`rounded border p-2 text-sm ${s.done ? "border-green-700 bg-green-50 text-green-950" : failedHere ? "border-red-700 bg-red-50 text-red-950" : i === current ? "border-amber-600 bg-amber-50 text-amber-950" : "border-slate-300 bg-white text-slate-600"}`}
          >
            <span className="font-semibold">{s.done ? "Done: " : failedHere ? "Failed: " : i === current ? "Next: " : "Waiting: "}</span>
            {s.label}
            {s.at && s.done && <span className="block text-xs">{fmtTime(s.at)}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export default function Console() {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [dirError, setDirError] = useState<string | null>(null);
  const [created, setCreated] = useState<OfferRow | null>(null);
  const [resetNote, setResetNote] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [needPin, setNeedPin] = useState<null | "pin_required" | "bad_pin" | "forbidden">(null);
  const [pinTick, setPinTick] = useState(0);

  // Calls the recruiter API. A PIN (only needed when this app is reached from another host) is kept in sessionStorage.
  const apiFetch = useCallback(async (path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const pin = typeof window !== "undefined" ? window.sessionStorage.getItem(PIN_KEY) : null;
    if (pin) headers.set("x-recruiter-pin", pin);
    const r = await fetch(path, { ...init, headers, cache: "no-store" });
    if (r.status === 403) {
      const code = ((await r.clone().json().catch(() => ({}))) as { error?: string }).error;
      if (code === "pin_required" || code === "bad_pin" || code === "forbidden") setNeedPin(code);
    } else setNeedPin(null);
    return r;
  }, []);

  const loadOffers = useCallback(async () => {
    const r = await apiFetch("/api/recruiter/offers");
    if (!r.ok) throw new Error(`offers ${r.status}`);
    const j = (await r.json()) as { offers: OfferRow[]; meta?: Meta };
    setOffers(j.offers);
    if (j.meta) setMeta(j.meta);
  }, [apiFetch]);

  // Directory for the create form (reloads after a PIN is entered).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await apiFetch("/api/recruiter/directory");
      if (cancelled) return;
      if (r.ok) {
        setDirectory((await r.json()) as Directory);
        setDirError(null);
      } else setDirError(((await r.json().catch(() => ({}))) as { message?: string }).message ?? `Could not load teams (${r.status})`);
    })().catch(() => !cancelled && setDirError("Could not load teams."));
    return () => {
      cancelled = true;
    };
  }, [apiFetch, pinTick]);

  // Live status: the server runs the invite and the MyJourney call; this page only polls.
  useEffect(() => {
    let stopped = false;
    const run = () => {
      if (!stopped) loadOffers().catch(() => undefined);
    };
    run();
    const h = setInterval(run, 3000);
    return () => {
      stopped = true;
      clearInterval(h);
    };
  }, [loadOffers, pinTick]);

  const log = useMemo(
    () =>
      offers
        .flatMap((o) => (o.events ?? []).map((e) => ({ at: e.at, msg: e.msg, who: o.candidate ? `${o.candidate.firstName} ${o.candidate.lastName}` : o.jobTitle })))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 50),
    [offers],
  );

  async function retry(id: string) {
    const r = await apiFetch(`/api/recruiter/offers/${id}/retry`, { method: "POST" });
    if (!r.ok) setNote("Retry was refused.");
    await loadOffers().catch(() => {});
  }

  const real = meta?.invites === "real";
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Recruiter console</h1>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>{real ? "Real Entra invites ON" : "Invites simulated"}</span>
          <button
            onClick={async () => {
              if (!window.confirm("Reset demo data? This deletes all offers and candidate emails held by this mock HR app.")) return;
              const r = await apiFetch("/api/recruiter/reset", { method: "POST" });
              if (!r.ok) return setNote("Reset was refused.");
              setOffers([]);
              setCreated(null);
              setNote(null);
              setResetNote(true);
            }}
            className="rounded border border-red-300 bg-white px-3 py-1 text-red-900 hover:bg-red-50"
          >
            Reset demo data
          </button>
        </div>
      </div>

      {needPin && <PinPrompt reason={needPin} onSubmit={(pin) => { window.sessionStorage.setItem(PIN_KEY, pin); setPinTick((t) => t + 1); }} />}

      {note && (
        <p role="status" className="rounded border border-slate-300 bg-slate-50 p-3 text-sm">
          {note}
        </p>
      )}

      {meta?.invites === "simulated_no_credentials" && (
        <p role="alert" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
          Real invites are approved, but WORKDAY_GRAPH_TENANT_ID, WORKDAY_GRAPH_CLIENT_ID and WORKDAY_GRAPH_CLIENT_SECRET are not all set in this app&apos;s .env, so invites are simulated.
        </p>
      )}

      {real && meta && isLocalUrl(meta.myJourneyPublicUrl) && (
        <p role="alert" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
          Real invites are on, but the public MyJourney URL is {meta.myJourneyPublicUrl}. Candidates on another device can&apos;t open localhost; set NEXT_PUBLIC_MYJOURNEY_PUBLIC_URL to a tunnel URL.
        </p>
      )}

      {resetNote && (
        <p role="status" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
          Mock HR data cleared. MyJourney keeps the journey it created: run <code className="font-mono">npm run db:seed</code> in MyJourney to remove it (safe while the dev server runs) before the next rehearsal.
        </p>
      )}

      <CreateOffer
        directory={directory}
        dirError={dirError}
        onCreate={async (input) => {
          const r = await apiFetch("/api/recruiter/offers", { method: "POST", body: JSON.stringify(input) });
          const j = (await r.json().catch(() => ({}))) as { offer?: OfferRow; message?: string };
          if (!r.ok || !j.offer) return j.message ?? `Could not create the offer (${r.status})`;
          setCreated(j.offer);
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
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {o.jobTitle} <span className="font-normal text-slate-600">· {o.teamName}</span>
                  </p>
                  <p className="text-sm text-slate-600">
                    {o.candidate ? `${o.candidate.firstName} ${o.candidate.lastName}` : "Awaiting candidate"} · LM {o.lineManagerName} · starts {o.startDate}
                  </p>
                  <p className="text-sm text-slate-600">{JOB_FAMILY_LABELS[o.jobFamily] ?? o.jobFamily}</p>
                  {o.redeemUrl && <RedeemLink url={o.redeemUrl} />}
                  {o.status === "failed" && <p className="mt-1 text-sm text-red-800">{o.error}</p>}
                  {o.status === "sent" && (
                    <button onClick={() => setCreated(o)} className="mt-1 text-sm text-blue-800 underline">
                      Show link
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[o.status]}`}>{o.status.replace(/_/g, " ")}</span>
                  {o.status === "failed" && (
                    <button onClick={() => void retry(o.id)} className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50">
                      Retry
                    </button>
                  )}
                </div>
                <div className="w-full">
                  <Timeline o={o} />
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
          {log.length === 0 && <li className="text-slate-500">Waiting for activity. The server sends invitations automatically when a candidate accepts.</li>}
          {log.map((l, i) => (
            <li key={`${l.at}-${i}`}>
              <span className="text-slate-500">{new Date(l.at).toLocaleTimeString("en-GB")}</span> [{l.who}] {l.msg}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function PinPrompt({ reason, onSubmit }: { reason: "pin_required" | "bad_pin" | "forbidden"; onSubmit: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  if (reason === "forbidden")
    return (
      <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
        The recruiter console is limited to this computer (open it on http://localhost:3001), or set RECRUITER_PIN in .env to allow other hosts.
      </p>
    );
  return (
    <form
      role="alert"
      className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(pin);
        setPin("");
      }}
    >
      <label className="font-medium">
        {reason === "bad_pin" ? "That PIN is not correct. " : ""}Recruiter PIN
        <input type="password" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} className="ml-2 rounded border border-slate-400 bg-white px-2 py-1" />
      </label>
      <button className="ml-2 rounded bg-blue-700 px-3 py-1 font-medium text-white hover:bg-blue-800">Unlock</button>
    </form>
  );
}

function CreateOffer({
  directory,
  dirError,
  onCreate,
}: {
  directory: Directory | null;
  dirError: string | null;
  onCreate: (i: { jobTitle: string; jobFamily: JobFamily; teamKey: string; lineManagerKey: string; startDate: string; conditions: string[] }) => Promise<string | null>;
}) {
  const [jobTitle, setJobTitle] = useState("Software Engineer");
  const [teamKey, setTeamKey] = useState("");
  const [lmKey, setLmKey] = useState("");
  const [jobFamily, setJobFamily] = useState<JobFamily>("ENGINEERING");
  // Random date chosen after mount: computing it during render made the server and client HTML differ (hydration error).
  const [startDate, setStartDate] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setStartDate((d) => d || randomMonday()), 0);
    return () => clearTimeout(t);
  }, []);
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
        const dErr = startDateError(startDate);
        if (dErr) {
          setErr(dErr);
          setBusy(false);
          return;
        }
        const m = await onCreate({ jobTitle, jobFamily, teamKey: effTeam, lineManagerKey: effLm, startDate, conditions: CONDITION_OPTIONS.filter((c) => conds.has(c)) });
        setErr(m);
        setBusy(false);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Create conditional offer</h2>
        <button
          type="button"
          onClick={() => {
            const t = directory?.teams.find((x) => x.name === DEMO_TEAM_NAME);
            if (t) {
              setTeamKey(t.key);
              setLmKey(t.lineManagers.find((m) => m.name === DEMO_LM_NAME)?.key ?? "");
            }
            setJobTitle("Software Engineer");
            setJobFamily("ENGINEERING");
            setStartDate((d) => d || randomMonday());
            setConds(new Set(DEFAULT_CONDITIONS));
          }}
          className="rounded border border-blue-300 bg-white px-3 py-1 text-sm font-medium text-blue-900 hover:bg-blue-50"
        >
          Fill demo offer
        </button>
      </div>
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
          <input type="date" className={field} value={startDate} onChange={(e) => setStartDate(e.target.value)} required aria-describedby="start-help" />
          <span id="start-help" className="mt-1 block text-xs font-normal text-slate-600">
            {startDate ? fmtDay(startDate) : "Pick a Monday"}. Must be a Monday within the next 3 months.
          </span>
          <button type="button" onClick={() => setStartDate(randomMonday())} className="mt-1 rounded border border-slate-300 bg-white px-3 py-1 text-sm font-medium hover:bg-slate-50">
            Pick another Monday
          </button>
        </label>
        <label className="block text-sm font-medium">
          Job family
          <select className={field} value={jobFamily} onChange={(e) => setJobFamily(e.target.value as JobFamily)} required>
            {JOB_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {JOB_FAMILY_LABELS[f]}
              </option>
            ))}
          </select>
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
    QRCode.toDataURL(link, { margin: 2, width: 360 }).then((u) => !c && setQr(u)).catch(() => {});
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
          <p className="break-all rounded border-2 border-slate-400 bg-white p-4 font-mono text-2xl font-semibold">{link}</p>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(link).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="mt-3 rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <p className="mt-2 text-sm text-slate-600">Scan the code to open the offer on a phone (the phone must reach this computer).</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr && <img src={qr} alt="QR code for the candidate offer link" width={360} height={360} className="rounded border border-slate-300 bg-white" />}
      </div>
    </section>
  );
}

function RedeemLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 rounded border border-slate-300 bg-slate-50 p-2 text-sm">
      <p className="font-medium">Fallback invitation link (recruiter only, do not show the candidate; held in server memory, not stored)</p>
      <p className="mt-1 break-all font-mono text-xs">{url}</p>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(url).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="mt-1 rounded border border-slate-400 bg-white px-3 py-1 hover:bg-slate-100"
      >
        {copied ? "Copied" : "Copy invite link"}
      </button>
    </div>
  );
}
