"use client";

import { useState } from "react";
import { useSession } from "@/lib/auth/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import type { WorkAccountDto } from "./types";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "");

/** One line describing the D39 work-account state. Plain text, no secrets (none are ever stored). */
export function workAccountLine(w: WorkAccountDto): string | null {
  switch (w.state) {
    case "converted":
      return `Work account: converted on ${fmt(w.at)}${w.upn ? ` (${w.upn})` : ""}${w.emailSent === false ? ". The sign-in email was NOT sent" : ""}`;
    case "simulated":
      return `Work account: simulated${w.upn ? ` (would become ${w.upn})` : ""}. Guest conversion is not switched on`;
    case "pending":
      return "Work account: pending";
    case "failed":
      return `Work account: failed${w.error ? ` (${w.error})` : ""}`;
    default:
      return null;
  }
}

/** Retry (P&P and Admin only; the API enforces it too). Shown for failed and simulated states. */
export function WorkAccountRetry({ journeyId, state, onDone, label = "Retry" }: { journeyId: string; state: WorkAccountDto["state"]; onDone?: () => void; label?: string }) {
  const { apiFetch, user } = useSession();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const allowed = !!user && user.roles.some((r) => r === "ADMIN" || r === "PNP");
  if (!allowed || (state !== "failed" && state !== "simulated" && state !== "pending")) return null;
  async function go() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiFetch(`/api/admin/journeys/${encodeURIComponent(journeyId)}/convert`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = (await r.json().catch(() => ({}))) as { status?: string; reason?: string; message?: string };
      if (j.status === "refused") setMsg(j.reason ?? "Not eligible");
      else if (!r.ok) setMsg(j.message ?? `Request failed (${r.status})`);
      onDone?.();
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={go} disabled={busy} aria-busy={busy}>{label}</Button>
      {msg && <span role="status" className="text-sm text-muted">{msg}</span>}
    </span>
  );
}

/** Panel for the LM / P&P starter detail view. */
export function WorkAccountNote({ journeyId, workAccount, onChanged }: { journeyId: string; workAccount: WorkAccountDto; onChanged?: () => void }) {
  const line = workAccountLine(workAccount);
  if (!line) return null;
  const tone = workAccount.state === "failed" || (workAccount.state === "converted" && workAccount.emailSent === false) ? "warning" : workAccount.state === "converted" ? "success" : "info";
  return (
    <Alert tone={tone} title="Work account" action={<WorkAccountRetry journeyId={journeyId} state={workAccount.state} onDone={onChanged} />}>
      {line}
    </Alert>
  );
}
