"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { accessInstructions } from "@/lib/graph";

interface OfferView {
  jobTitle: string;
  teamName: string;
  lineManagerName: string;
  startDate: string;
  conditions: string[];
  salary: string;
  firstName: string | null;
  expired: boolean;
  phase: "open" | "setting_up" | "invited" | "simulated";
}

type Errors = Partial<Record<"firstName" | "lastName" | "email" | "confirmEmail" | "accepted", string>>;

const PLAIN: Record<string, string> = {
  "Satisfactory pre-employment vetting": "We need to complete background checks to our satisfaction before you start.",
  References: "We need to receive satisfactory references from your previous employers.",
  "Right to work in the UK": "You must be able to show you have the right to work in the UK.",
  "Satisfactory completion of a health declaration": "You need to complete a short health declaration.",
};

const myJourneyUrl = () => process.env.NEXT_PUBLIC_MYJOURNEY_PUBLIC_URL || "http://localhost:3000";

export default function OfferClient({ token }: { token: string }) {
  const [offer, setOffer] = useState<OfferView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/offers/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (r.status === 404) return setProblem("This offer link is not valid. Please check the link or contact your recruiter.");
      if (r.status === 429) return;
      if (!r.ok) return setProblem("Something went wrong. Please try again shortly.");
      setProblem(null);
      setOffer(((await r.json()) as { offer: OfferView }).offer);
    } catch {
      setProblem("Something went wrong. Please try again shortly.");
    }
  }, [token]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Live updates after acceptance.
  const phase = offer?.phase;
  useEffect(() => {
    if (!phase || phase === "open" || phase === "invited" || phase === "simulated") return;
    const h = setInterval(() => void load(), 3000);
    return () => clearInterval(h);
  }, [phase, load]);

  if (problem) return <Card><p role="alert" className="text-red-900">{problem}</p></Card>;
  if (!offer) return <p role="status">Loading your offer…</p>;
  if (offer.phase !== "open") return <Confirmation offer={offer} />;
  if (offer.expired) return <Card><h1 className="text-xl font-semibold">This offer link has expired</h1><p className="mt-2">Please contact your recruiter for a new link.</p></Card>;
  return <Letter token={token} offer={offer} onAccepted={(o) => setOffer(o)} onGone={(m) => setProblem(m)} />;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">{children}</div>;
}

function fmtDate(d: string) {
  const dt = new Date(`${d}T12:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function Letter({ token, offer, onAccepted, onGone }: { token: string; offer: OfferView; onAccepted: (o: OfferView) => void; onGone: (m: string) => void }) {
  const [v, setV] = useState({ firstName: "", lastName: "", email: "", confirmEmail: "", accepted: false });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const r = await fetch(`/api/offers/${encodeURIComponent(token)}/accept`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
      const j = (await r.json().catch(() => ({}))) as { offer?: OfferView; errors?: Errors; message?: string };
      if (r.status === 201 && j.offer) return onAccepted(j.offer);
      if (r.status === 400 && j.errors) {
        setErrors(j.errors);
        const first = (["firstName", "lastName", "email", "confirmEmail", "accepted"] as const).find((k) => j.errors?.[k]);
        if (first) refs.current[first]?.focus();
        return;
      }
      if (r.status === 409 || r.status === 410 || r.status === 404) return onGone(j.message ?? "This offer link is no longer valid.");
      setFormError(j.message ?? "Something went wrong. Please try again.");
    } catch {
      setFormError("We could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = (k: "firstName" | "lastName" | "email" | "confirmEmail", label: string, type = "text", autoComplete?: string) => (
    <div>
      <label htmlFor={k} className="block text-sm font-medium">{label}</label>
      <input
        id={k}
        ref={(el) => { refs.current[k] = el; }}
        type={type}
        autoComplete={autoComplete}
        value={v[k]}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
        aria-invalid={errors[k] ? true : undefined}
        aria-describedby={errors[k] ? `${k}-err` : undefined}
        className="mt-1 w-full rounded border border-slate-400 bg-white px-3 py-2 text-base"
      />
      {errors[k] && <p id={`${k}-err`} className="mt-1 text-sm text-red-800">{errors[k]}</p>}
    </div>
  );

  return (
    <Card>
      <h1 className="text-2xl font-semibold">Conditional offer of employment</h1>
      <p className="mt-4">We are delighted to offer you the role of <strong>{offer.jobTitle}</strong> in the <strong>{offer.teamName}</strong> team, reporting to <strong>{offer.lineManagerName}</strong>.</p>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        <div><dt className="text-sm text-slate-600">Start date</dt><dd className="font-medium">{fmtDate(offer.startDate)}</dd></div>
        <div><dt className="text-sm text-slate-600">Salary</dt><dd className="font-medium">{offer.salary}</dd></div>
      </dl>
      {offer.conditions.length > 0 && (
        <>
          <h2 className="mt-6 font-semibold">This offer is conditional on</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {offer.conditions.map((c) => <li key={c}><strong>{c}.</strong> {PLAIN[c] ?? ""}</li>)}
          </ul>
        </>
      )}
      <form onSubmit={submit} noValidate className="mt-8 space-y-4 border-t border-slate-200 pt-6">
        <h2 className="font-semibold">Accept your offer</h2>
        {formError && <p role="alert" className="text-red-800">{formError}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {input("firstName", "First name", "text", "given-name")}
          {input("lastName", "Last name", "text", "family-name")}
        </div>
        {input("email", "Personal email address", "email", "email")}
        {input("confirmEmail", "Confirm personal email address", "email", "email")}
        <p className="text-sm text-slate-600">We will send your invitation to access MyJourney to this address.</p>
        <div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              ref={(el) => { refs.current.accepted = el; }}
              checked={v.accepted}
              onChange={(e) => setV({ ...v, accepted: e.target.checked })}
              aria-invalid={errors.accepted ? true : undefined}
              aria-describedby={errors.accepted ? "accepted-err" : undefined}
              className="mt-1 h-5 w-5"
            />
            <span>I accept the conditions of this offer</span>
          </label>
          {errors.accepted && <p id="accepted-err" className="mt-1 text-sm text-red-800">{errors.accepted}</p>}
        </div>
        <button disabled={busy} className="w-full rounded bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60 sm:w-auto">
          {busy ? "Accepting…" : "Accept offer"}
        </button>
      </form>
    </Card>
  );
}

function Confirmation({ offer }: { offer: OfferView }) {
  const waiting = offer.phase === "setting_up";
  return (
    <Card>
      <h1 className="text-2xl font-semibold">Thank you{offer.firstName ? `, ${offer.firstName}` : ""}. Offer accepted.</h1>
      <p role="status" aria-live="polite" className={`mt-4 rounded p-3 font-medium ${waiting ? "bg-amber-100 text-amber-950" : "bg-green-100 text-green-950"}`}>
        {waiting
          ? "Setting up your access…"
          : offer.phase === "simulated"
            ? "Demo: the invitation from Microsoft was simulated, so no email was sent. In a live run, this is where you would check your email."
            : "Check your email for an invitation from Microsoft to access MyJourney."}
      </p>
      <h2 className="mt-6 font-semibold">How to access MyJourney</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        {accessInstructions(myJourneyUrl()).map((s) => <li key={s}>{s}</li>)}
      </ol>
    </Card>
  );
}
