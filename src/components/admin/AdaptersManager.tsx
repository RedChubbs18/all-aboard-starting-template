"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/auth/use-api";
import { Alert, Confirm, btnCls, useNotice, useSend } from "./common";

/** User-facing names (D9: the vetting provider is First Advantage; the adapter key stays `hireview`). */
const LABELS: Record<string, string> = { hireview: "First Advantage (vetting)" };

interface AdapterRow{ key: string; mode: "MOCK" | "REAL"; envOverride: boolean }

/** FR-AD.4 (modes). Switching to REAL asks for confirmation; an env override still wins at runtime. */
export function AdaptersManager() {
  const list = useApi<AdapterRow[]>("/api/admin/adapters");
  const send = useSend();
  const n = useNotice();
  const [confirm, setConfirm] = useState<AdapterRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function change(a: AdapterRow, mode: "MOCK" | "REAL") {
    setBusy(true);
    const r = await send("PUT", `/api/admin/adapters/${a.key}`, { mode });
    setBusy(false);
    setConfirm(null);
    if (r.ok) {
      n.success(`${a.key} set to ${mode}.${a.envOverride ? " The environment override still decides the live mode." : ""}`);
      list.reload();
    } else n.fail(r.message);
  }

  return (
    <div className="space-y-4">
      <Alert kind="info">Real adapters are not connected yet. Switching one to REAL makes it fail with &quot;not configured&quot; until it is built.</Alert>
      {n.notice}
      {list.error && <Alert kind="danger">{list.error}</Alert>}
      <p>
        To run integration events for a demo (for example &quot;First Advantage cleared&quot;), use{" "}
        <Link href="/admin/simulate" className="font-medium text-brand-strong underline">Simulate</Link>.
      </p>
      <ul className="divide-y divide-line rounded-lg bg-card px-4 border border-line">
        {(list.data ?? []).map((a) => (
          <li key={a.key} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="font-medium">{LABELS[a.key] ?? a.key}{LABELS[a.key] && <span className="text-sm font-normal text-muted"> (key {a.key})</span>}</p>
              <p className="text-sm text-muted">
                Mode: <strong>{a.mode}</strong>
                {a.envOverride && <> | Set by environment variable ADAPTER_{a.key.toUpperCase()}_MODE, which overrides this switch</>}
              </p>
            </div>
            <button
              type="button"
              className={btnCls.secondary}
              disabled={busy}
              aria-label={`Switch ${LABELS[a.key] ?? a.key} to ${a.mode === "MOCK" ? "REAL" : "MOCK"}`}
              onClick={() => (a.mode === "MOCK" ? setConfirm(a) : change(a, "MOCK"))}
            >
              Switch to {a.mode === "MOCK" ? "REAL" : "MOCK"}
            </button>
          </li>
        ))}
        {list.loading && <li className="py-3 text-muted">Loading…</li>}
      </ul>
      <Confirm
        open={!!confirm}
        title={`Switch ${confirm?.key ?? ""} to REAL?`}
        message="Real integrations are not connected yet, so tasks that use this adapter may fail."
        confirmLabel="Switch to REAL"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && change(confirm, "REAL")}
      />
    </div>
  );
}
