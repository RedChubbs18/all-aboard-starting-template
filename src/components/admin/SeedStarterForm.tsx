"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/auth/use-api";
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

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");

/** Demo step 1: "Seed a new starter". */
export function SeedStarterForm() {
  const dir = useApi<Dir>("/api/admin/directory");
  const send = useSend();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [v, setV] = useState({ existingUserId: "", displayName: "", upn: "", teamId: "", lmId: "", buddyId: "", startDate: "" });
  const [upnTouched, setUpnTouched] = useState(false);
  const [errors, setErrors] = useState<Fields>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const set = (k: keyof typeof v, val: string) => setV((o) => ({ ...o, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setResult(null);
    const body = mode === "existing" ? { existingUserId: v.existingUserId, teamId: v.teamId, lmId: v.lmId, buddyId: v.buddyId || null, startDate: v.startDate } : { ...v, existingUserId: undefined, buddyId: v.buddyId || null };
    const r = await send<Result>("POST", "/api/admin/seed-starter", body);
    setBusy(false);
    if (r.ok) {
      setResult(r.data);
      setErrors({});
    } else {
      setErrors(r.fields);
      setMsg(r.message);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <Alert kind="info">Synthetic data only. The invite goes through the mocked identity adapter and no real email is sent. The work email must end in @example.test.</Alert>
      {result && (
        <section aria-live="polite" className="rounded-lg border-l-4 border-success bg-[#e2f3e8] p-4">
          <h2 className="text-lg font-semibold">Journey created for {result.starterName}</h2>
          <p>{result.taskCount} tasks created. {result.identity.ok ? `Guest invite: ${result.identity.status}.` : `Guest invite failed: ${result.identity.message}. The journey was still created.`}</p>
          <p className="mt-3 flex flex-wrap gap-4">
            <Link className="min-h-11 font-medium text-brand underline" href={result.links.lm}>Open the line manager view</Link>
            <Link className="min-h-11 font-medium text-brand underline" href={result.links.journey}>Open the journey</Link>
            <Link className="min-h-11 font-medium text-brand underline" href="/admin/simulate">Simulate integration events</Link>
          </p>
        </section>
      )}
      {msg && !Object.keys(errors).length && <Alert kind="danger">{msg}</Alert>}
      {dir.error && <Alert kind="danger">{dir.error}</Alert>}
      <form onSubmit={submit} className="space-y-3 rounded-lg bg-surface p-4 shadow-card" noValidate>
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
        <button type="submit" className={btnCls.primary} disabled={busy} aria-busy={busy}>Create journey and send invite</button>
      </form>
    </div>
  );
}
