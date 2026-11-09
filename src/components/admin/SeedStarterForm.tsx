"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/auth/use-api";
import { useSession } from "@/lib/auth/client";
import { graphInvitesEnabled, inviteDemoMailbox } from "@/lib/auth/config";
import { buildWelcomeEmail, PREVIEW_REDEEM_URL } from "@/lib/graph/email";
import { FALLBACK_MESSAGES, GRAPH_INVITE_SCOPES, sendGraphInvite, type InviteOutcome } from "@/lib/graph/invite";
import { Alert, Field, btnCls, inputCls, useSend, type Fields } from "./common";

interface Dir {
  teams: { id: string; name: string }[];
  lms: { id: string; name: string; teamId: string | null }[];
  buddies: { id: string; name: string; teamId: string | null }[];
  starters: { id: string; name: string; teamId: string | null }[];
}
interface Result {
  journeyId: string;
  starterName: string;
  taskCount: number;
  identity: { ok: true; status: string } | { ok: false; message: string };
  links: { journey: string; lm: string };
}
type InviteNote = { kind: "success" | "warning"; text: string };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");

/** Demo step 1: "Seed a new starter". */
export function SeedStarterForm() {
  const dir = useApi<Dir>("/api/admin/directory");
  const send = useSend();
  const session = useSession();
  const graphOn = session.mode === "entra" && graphInvitesEnabled();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [v, setV] = useState({ existingUserId: "", displayName: "", upn: "", teamId: "", lmId: "", buddyId: "", startDate: "" });
  const [upnTouched, setUpnTouched] = useState(false);
  const [errors, setErrors] = useState<Fields>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [personalEmail, setPersonalEmail] = useState("");
  const [inviteNote, setInviteNote] = useState<InviteNote | null>(null);

  const set = (k: keyof typeof v, val: string) => setV((o) => ({ ...o, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setResult(null);
    setInviteNote(null);
    const email = personalEmail.trim();
    if (graphOn && !/^[^@\s]+@[^@\s]+$/.test(email)) {
      setErrors({ personalEmail: "Enter the starter's personal email" });
      setBusy(false);
      return;
    }
    // Incremental consent: ask for the invite scopes only now. May redirect once for consent (before anything is created).
    const token = graphOn ? await session.acquireGraphToken(GRAPH_INVITE_SCOPES) : null;
    const base = mode === "existing" ? { existingUserId: v.existingUserId, teamId: v.teamId, lmId: v.lmId, buddyId: v.buddyId || null, startDate: v.startDate } : { ...v, existingUserId: undefined, buddyId: v.buddyId || null };
    // With Graph on the personal email stays in this browser; otherwise it goes to the mock adapter, which never stores it.
    const body = graphOn ? { ...base, deferInvite: true } : email ? { ...base, inviteEmail: email } : base;
    const r = await send<Result>("POST", "/api/admin/seed-starter", body);
    setBusy(false);
    if (r.ok) {
      setResult(r.data);
      setErrors({});
      if (graphOn) await finishGraphInvite(r.data, email, token);
    } else {
      setErrors(r.fields);
      setMsg(r.message);
    }
  }

  /** Send the Graph invite from this browser, then report only the guest object id and status to the server. */
  async function finishGraphInvite(created: Result, email: string, token: Awaited<ReturnType<typeof session.acquireGraphToken>> | null) {
    let outcome: InviteOutcome;
    if (!token?.ok) {
      outcome = { status: "fallback", reason: token?.reason ?? "no_token" };
    } else {
      outcome = await sendGraphInvite({
        fetch: (...a) => fetch(...a),
        accessToken: token.accessToken,
        adminUpn: token.upn,
        demoMailbox: inviteDemoMailbox(),
        personalEmail: email,
        starterName: created.starterName,
        redirectUrl: window.location.origin,
        startDate: v.startDate,
      });
    }
    const report = outcome.status === "invited" ? { status: "invited", guestObjectId: outcome.guestObjectId, mailSent: outcome.mailSent } : { status: "fallback", reason: outcome.reason };
    const saved = await send("POST", `/api/admin/seed-starter/${encodeURIComponent(created.journeyId)}/invite-result`, report);
    if (outcome.status === "invited") {
      setInviteNote({
        kind: outcome.mailSent ? "success" : "warning",
        text: outcome.mailSent ? "Graph invite created. The welcome email with the redemption link was sent to the team demo mailbox only." : "Graph invite created, but the welcome email could not be sent to the demo mailbox.",
      });
    } else {
      setInviteNote({ kind: "warning", text: FALLBACK_MESSAGES[outcome.reason] });
    }
    if (!saved.ok) setInviteNote({ kind: "warning", text: `The invite ran but recording it failed: ${saved.message}` });
  }

  const previewMail = buildWelcomeEmail({
    starterName: (mode === "new" ? v.displayName : "") || "the starter",
    redeemUrl: PREVIEW_REDEEM_URL,
    productionRecipient: personalEmail.trim() || "the starter's personal email",
    startDate: v.startDate || undefined,
  });

  return (
    <div className="max-w-xl space-y-4">
      <Alert kind="info">
        {graphOn
          ? "Synthetic data only. A real Entra guest invite is created through Microsoft Graph, and the welcome email goes only to the team's in-tenant demo mailbox. The starter's personal email is never emailed or stored. The work email must end in @example.test."
          : "Synthetic data only. The invite goes through the mocked identity adapter and no real email is sent. The work email must end in @example.test."}
      </Alert>
      {result && (
        <section aria-live="polite" className="rounded-lg border-l-4 border-brand-strong bg-brand-tint p-4">
          <h2 className="text-lg font-bold">Journey created for {result.starterName}</h2>
          <p>{result.taskCount} tasks created. {result.identity.ok ? `Guest invite: ${result.identity.status}.` : `Guest invite failed: ${result.identity.message}. The journey was still created.`}</p>
          <p className="mt-3 flex flex-wrap gap-4">
            <Link className="min-h-11 font-medium text-brand-strong underline" href={result.links.lm}>Open the line manager view</Link>
            <Link className="min-h-11 font-medium text-brand-strong underline" href={result.links.journey}>Open the journey</Link>
            <Link className="min-h-11 font-medium text-brand-strong underline" href="/admin/simulate">Simulate integration events</Link>
          </p>
        </section>
      )}
      {inviteNote && <Alert kind={inviteNote.kind}>{inviteNote.text}</Alert>}
      {msg && !Object.keys(errors).length && <Alert kind="danger">{msg}</Alert>}
      {dir.error && <Alert kind="danger">{dir.error}</Alert>}
      <form onSubmit={submit} className="space-y-3 rounded-lg bg-card p-4 border border-line" noValidate>
        <fieldset>
          <legend className="font-medium">Starter</legend>
          <div className="flex gap-4">
            <label className="flex min-h-11 items-center gap-2"><input type="radio" className="size-5" name="mode" checked={mode === "new"} onChange={() => setMode("new")} />Create a new person</label>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" className="size-5" name="mode" checked={mode === "existing"} onChange={() => setMode("existing")} />Pick an existing starter</label>
          </div>
        </fieldset>
        {mode === "new" ? (
          <>
            <Field label="Display name" error={errors.displayName}>
              {(p) => (
                <input {...p} className={inputCls} value={v.displayName} onChange={(e) => { set("displayName", e.target.value); if (!upnTouched) set("upn", e.target.value ? `${slug(e.target.value)}@example.test` : ""); }} />
              )}
            </Field>
            <Field label="Work email (placeholder)" error={errors.upn} hint="Must end in @example.test.">
              {(p) => <input {...p} type="email" className={inputCls} value={v.upn} onChange={(e) => { setUpnTouched(true); set("upn", e.target.value); }} />}
            </Field>
          </>
        ) : (
          <Field label="Starter without a journey" error={errors.existingUserId}>
            {(p) => (
              <select {...p} className={inputCls} value={v.existingUserId} onChange={(e) => set("existingUserId", e.target.value)}>
                <option value="">Choose a starter</option>
                {(dir.data?.starters ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </Field>
        )}
        <Field label="Personal email (for the invite)" error={errors.personalEmail} hint="Used only to create the invite. Never stored. Use a synthetic address.">
          {(p) => <input {...p} type="email" className={inputCls} value={personalEmail} onChange={(e) => setPersonalEmail(e.target.value)} autoComplete="off" />}
        </Field>
        <Field label="Team" error={errors.teamId}>
          {(p) => (
            <select {...p} className={inputCls} value={v.teamId} onChange={(e) => set("teamId", e.target.value)}>
              <option value="">Choose a team</option>
              {(dir.data?.teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Line manager" error={errors.lmId}>
          {(p) => (
            <select {...p} className={inputCls} value={v.lmId} onChange={(e) => set("lmId", e.target.value)}>
              <option value="">Choose a line manager</option>
              {(dir.data?.lms ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Buddy (optional)" error={errors.buddyId}>
          {(p) => (
            <select {...p} className={inputCls} value={v.buddyId} onChange={(e) => set("buddyId", e.target.value)}>
              <option value="">No buddy yet</option>
              {(dir.data?.buddies ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Start date" error={errors.startDate}>
          {(p) => <input {...p} type="date" className={inputCls} value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />}
        </Field>
        <section aria-label="Invite email preview" className="rounded border border-line bg-page p-3 text-sm">
          <h3 className="font-bold">Email preview: what the starter receives</h3>
          <p className="mt-1"><span className="font-medium">Subject:</span> {previewMail.subject}</p>
          <div className="mt-2 space-y-2 whitespace-pre-line">{previewMail.text}</div>
          {graphOn && <p className="mt-2 text-muted">Hackathon mode: this email is sent only to the team demo mailbox, with the line above noting where it would go in production.</p>}
        </section>
        <button type="submit" className={btnCls.primary} disabled={busy} aria-busy={busy}>Create journey and send invite</button>
      </form>
    </div>
  );
}
