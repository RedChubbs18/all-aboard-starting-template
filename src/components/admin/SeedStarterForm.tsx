"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/auth/use-api";
import { useSession } from "@/lib/auth/client";
import { graphInviteExternalApproved, graphInvitesEnabled } from "@/lib/auth/config";
import { FALLBACK_MESSAGES, GRAPH_INVITE_SCOPES, guestDisplayName, isValidEmail, sendGraphInvite, type InviteOutcome } from "@/lib/graph/invite";
import { ErrorSummary } from "@/components/lm/error-summary";
import { Alert, Confirm, Field, btnCls, inputCls, useSend, type Fields } from "./common";

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
  const approved = graphInviteExternalApproved();
  // Real sending needs both flags. With Graph on but no approval, nothing goes to Graph and the mock runs.
  const sendReal = graphOn && approved;
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [v, setV] = useState({ existingUserId: "", displayName: "", upn: "", teamId: "", lmId: "", buddyId: "", startDate: "" });
  const [upnTouched, setUpnTouched] = useState(false);
  const [errors, setErrors] = useState<Fields>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [personalEmail, setPersonalEmail] = useState("");
  const [inviteNote, setInviteNote] = useState<InviteNote | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const set = (k: keyof typeof v, val: string) => setV((o) => ({ ...o, [k]: val }));

  const displayForGuest = mode === "new" ? v.displayName : (dir.data?.starters.find((s) => s.id === v.existingUserId)?.name ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const email = personalEmail.trim();
    if (sendReal && !isValidEmail(email)) {
      setErrors({ personalEmail: "Enter a valid personal email address for the invite" });
      setAttempt((n) => n + 1);
      return;
    }
    if (!sendReal && email && !isValidEmail(email)) {
      setErrors({ personalEmail: "Enter a valid email address" });
      setAttempt((n) => n + 1);
      return;
    }
    if (sendReal) setConfirming(true);
    else void run();
  }

  async function run() {
    setConfirming(false);
    setBusy(true);
    setMsg("");
    setErrors({});
    setResult(null);
    setInviteNote(null);
    const email = personalEmail.trim();
    // Incremental consent: ask for the invite scope only now. May redirect once for consent (before anything is created).
    const token = sendReal ? await session.acquireGraphToken(GRAPH_INVITE_SCOPES) : null;
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
      setAttempt((n) => n + 1);
    }
  }

  /** Send the Graph invite from this browser, then report only the guest object id and status to the server. */
  async function finishGraphInvite(created: Result, email: string, token: Awaited<ReturnType<typeof session.acquireGraphToken>> | null) {
    let outcome: InviteOutcome;
    if (!sendReal) {
      outcome = { status: "fallback", reason: "not_approved" };
    } else if (!token?.ok) {
      outcome = { status: "fallback", reason: token?.reason ?? "no_token" };
    } else {
      outcome = await sendGraphInvite({
        fetch: (...a) => fetch(...a),
        accessToken: token.accessToken,
        approved,
        personalEmail: email,
        starterName: created.starterName,
        redirectUrl: window.location.origin,
      });
    }
    const report = outcome.status === "invited" ? { status: "invited", guestObjectId: outcome.guestObjectId } : { status: "fallback", reason: outcome.reason };
    const saved = await send("POST", `/api/admin/seed-starter/${encodeURIComponent(created.journeyId)}/invite-result`, report);
    if (outcome.status === "invited") {
      setInviteNote({ kind: "success", text: "Invitation created. Microsoft Entra sends its standard invitation email to the address you entered." });
    } else {
      setInviteNote({ kind: "warning", text: FALLBACK_MESSAGES[outcome.reason] });
    }
    if (!saved.ok) setInviteNote({ kind: "warning", text: `The invite ran but recording it failed: ${saved.message}` });
  }

  return (
    <div className="max-w-xl space-y-4">
      <Alert kind="info">
        {graphOn
          ? "Synthetic data only. A real Entra guest invite is created through Microsoft Graph and Microsoft emails its standard invitation to the personal address you type. The address is never stored. The work email must end in @example.test."
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

      {dir.error && <Alert kind="danger">{dir.error}</Alert>}
      <form onSubmit={submit} className="space-y-3 rounded-lg bg-card p-4 border border-line" noValidate>
        {/* The server message is always shown; field problems are listed under it. Focus moves here after a failed submit. */}
        <ErrorSummary
          message={msg || (Object.keys(errors).length ? "Check the fields below." : null)}
          items={Object.values(errors)}
          title={Object.keys(errors).length ? "Please fix the highlighted fields" : "Couldn't create the journey"}
          focusKey={attempt}
        />
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
        <Field label={sendReal ? "Personal email (required, for the invite)" : "Personal email (for the invite)"} error={errors.personalEmail} hint={sendReal ? "Type it at demo time. Used only to send the invite. Never stored." : "Used only to create the invite. Never stored. Use a synthetic address."}>
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
        <p className="rounded border border-line bg-page p-3 text-sm">
          {sendReal
            ? "Microsoft sends its standard invitation email, with a short welcome line from us. No custom email is drafted."
            : graphOn
              ? "External invite email not approved for this environment. The demo invite is used and no email is sent."
              : "No real email is sent in this mode."}
        </p>
        <button type="submit" className={btnCls.primary} disabled={busy} aria-busy={busy}>Create journey and send invite</button>
      </form>
      <Confirm
        open={confirming}
        title="Send invitation?"
        message={
          <p>
            Send a real Microsoft Entra invitation email to {personalEmail.trim()}? This creates a guest user {guestDisplayName(displayForGuest || "starter")} in the shared tenant.
          </p>
        }
        confirmLabel="Send invite"
        tone="primary"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void run()}
      />
    </div>
  );
}
