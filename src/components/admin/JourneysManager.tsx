"use client";

import { useState } from "react";
import { useApi } from "@/lib/auth/use-api";
import { Alert, Drawer, Field, btnCls, inputCls, useNotice, useSend, type Fields } from "./common";

interface J { id: string; starterName: string; teamName: string; startDate: string; stage: string; status: string; exitReason: string | null }

const GROUPS: { label: string; reasons: [string, string][] }[] = [
  {
    label: "Recorded by P&P",
    reasons: [["FAILED_PEV", "Failed vetting"], ["OFFER_WITHDRAWN_BY_LBG", "Offer withdrawn by the bank"], ["NO_SHOW", "Did not turn up"]],
  },
  {
    label: "What the colleague told us",
    reasons: [
      ["ACCEPTED_ANOTHER_OFFER", "Accepted another offer"], ["ROLE_NOT_RIGHT", "Role not right"], ["PERSONAL_CIRCUMSTANCES", "Personal circumstances"],
      ["PAY_OR_BENEFITS", "Pay or benefits"], ["LOCATION_OR_HYBRID", "Location or hybrid working"], ["ONBOARDING_EXPERIENCE", "Onboarding experience"],
      ["PREFER_NOT_TO_SAY", "Prefers not to say"], ["OTHER", "Other"],
    ],
  },
];

/** D14: record that a starter has left. Available to P&P and Admin through the API. */
export function JourneysManager() {
  const list = useApi<J[]>("/api/admin/journeys");
  const send = useSend();
  const n = useNotice();
  const [target, setTarget] = useState<J | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Fields>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    const r = await send("POST", `/api/admin/journeys/${target.id}/exit`, { reason, note: note || undefined });
    setBusy(false);
    if (r.ok) {
      n.success(`Exit recorded for ${target.starterName}.`);
      setTarget(null);
      list.reload();
    } else setErrors({ ...r.fields, _: r.message });
  }

  return (
    <div className="space-y-4">
      <Alert kind="info">Record an exit when a starter withdraws, fails vetting or does not turn up. The journey stops and the reason feeds the MI funnel.</Alert>
      {n.notice}
      {list.error && <Alert kind="danger">{list.error}</Alert>}
      <ul className="divide-y divide-border/40 rounded-lg bg-surface px-4 shadow-card">
        {(list.data ?? []).map((j) => (
          <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="font-medium">{j.starterName}</p>
              <p className="text-sm text-text-muted">{j.teamName} | starts {j.startDate.slice(0, 10)} | {j.stage} | {j.status}{j.exitReason ? ` (${j.exitReason})` : ""}</p>
            </div>
            {j.status === "active" && (
              <button type="button" className={btnCls.secondary} aria-label={`Record exit for ${j.starterName}`} onClick={() => { setTarget(j); setReason(""); setNote(""); setErrors({}); }}>
                Record exit
              </button>
            )}
          </li>
        ))}
        {list.loading && <li className="py-3 text-text-muted">Loading…</li>}
      </ul>
      <Drawer title={target ? `Record exit: ${target.starterName}` : "Record exit"} open={!!target} onClose={() => setTarget(null)}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          {errors._ && !errors.reason && <Alert kind="danger">{errors._}</Alert>}
          <Field label="Reason" error={errors.reason}>
            {(p) => (
              <select {...p} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Choose a reason</option>
                {GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.reasons.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </optgroup>
                ))}
              </select>
            )}
          </Field>
          <Field label="Note (optional)" error={errors.note} hint="Do not include personal or health details.">
            {(p) => <textarea {...p} rows={3} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnCls.secondary} onClick={() => setTarget(null)}>Cancel</button>
            <button type="submit" className={btnCls.danger} disabled={busy} aria-busy={busy}>Record exit</button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
