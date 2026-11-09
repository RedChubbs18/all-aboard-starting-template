"use client";

import { useState } from "react";
import { useSession } from "@/lib/auth/client";
import { useApi } from "@/lib/auth/use-api";
import { AdapterCard, ADAPTER_LABELS, type AdapterViewData } from "./AdapterCard";
import { DemoScript, type DemoStepId } from "./DemoScript";
import { Toaster, useToasts } from "./Toaster";

interface JourneyOption { id: string; starter: string; stage: string; flagged: boolean }
interface ListData { demoStarterId: string; journeys: JourneyOption[] }
interface StateData {
  journey: { id: string; stage: string; flagged: boolean; flagReason: string | null };
  adapters: AdapterViewData[];
  systemTasks: { key: string; title: string; status: string }[];
  events: { id: string; type: string; entityId: string | null; to: string | null; at: string }[];
}

const human = (s: string) => s.replace(/_/g, " ").toLowerCase();

/** FR-AD.4: simulate integration events and run the demo script. ADMIN and PNP only (the page wraps this in RoleGate). */
export function SimulatePanel() {
  const { apiFetch } = useSession();
  const { toasts, push, dismiss } = useToasts();
  const list = useApi<ListData>("/api/simulate");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [force, setForce] = useState(true);
  const [detail, setDetail] = useState("");

  const journeys = list.data?.journeys ?? [];
  const selected = picked ?? journeys.find((j) => j.id === `journey-${list.data?.demoStarterId}`)?.id ?? journeys[0]?.id ?? null;
  const state = useApi<StateData>(selected ? `/api/simulate/state?journeyId=${encodeURIComponent(selected)}` : null);

  const refresh = () => {
    list.reload();
    state.reload();
  };

  async function call(busyId: string, path: string, body: unknown, title: (r: Record<string, unknown>) => string) {
    setBusy(busyId);
    try {
      const res = await apiFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        push({ kind: "error", title: "That did not work", lines: [String(json.message ?? json.error ?? `Request failed (${res.status})`)] });
      } else {
        const changes = Array.isArray(json.changes) ? (json.changes as string[]) : [];
        push({ kind: "success", title: title(json), lines: changes.length ? changes : ["No visible change (already in that state)."] });
        refresh();
      }
    } catch {
      push({ kind: "error", title: "Network problem", lines: ["Could not reach the server. Try again."] });
    } finally {
      setBusy(null);
    }
  }

  const simulate = (adapterKey: string, status: string) =>
    selected &&
    call(`${adapterKey}:${status}`, "/api/simulate", { adapterKey, journeyId: selected, status, ...(detail.trim() ? { detail: detail.trim() } : {}) }, () =>
      `${ADAPTER_LABELS[adapterKey] ?? adapterKey}: ${status.replace(/_/g, " ")}`,
    );
  const demo = (step: DemoStepId) => call(step, "/api/simulate/demo", { step }, (r) => String(r.message ?? "Done"));
  const tick = () =>
    call("tick", "/api/simulate/tick", { force }, (r) => {
      const sent = Array.isArray(r.sent) ? r.sent.length : 0;
      return `Reminders run: ${sent} sent, ${String(r.suppressed ?? 0)} suppressed`;
    });

  return (
    <div className="space-y-4">
      <Toaster toasts={toasts} onDismiss={dismiss} />
      <header>
        <h1 className="text-2xl font-semibold text-brand-strong">Simulate integrations</h1>
        <p role="note" className="mt-2 rounded-md border-l-4 border-info bg-[#e4effb] p-3 text-sm">
          Demo tools. Changes mock adapters only.
        </p>
      </header>

      {(list.error || state.error) && <p role="alert" className="text-danger">{list.error ?? state.error}</p>}
      {list.loading && <p role="status" className="text-text-muted">Loading…</p>}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <section aria-labelledby="pick-h" className="rounded-md border border-border bg-surface p-4 shadow-card">
            <h2 id="pick-h" className="text-lg font-semibold">Starter</h2>
            <label htmlFor="journey-select" className="mt-2 block text-sm font-semibold">Journey</label>
            <select
              id="journey-select"
              value={selected ?? ""}
              onChange={(e) => setPicked(e.target.value)}
              className="mt-1 min-h-12 w-full rounded-md border-2 border-border bg-surface px-3 text-base"
            >
              {journeys.map((j) => (
                <option key={j.id} value={j.id}>{j.starter} ({human(j.stage)}{j.flagged ? ", flagged" : ""})</option>
              ))}
            </select>
            {state.data && (
              <p className="mt-2 text-sm" aria-live="polite">
                Stage: <strong>{human(state.data.journey.stage)}</strong>.{" "}
                {state.data.journey.flagged ? <strong className="text-danger">Flagged{state.data.journey.flagReason ? `: ${state.data.journey.flagReason}` : ""}</strong> : "Not flagged."}
              </p>
            )}
            <label htmlFor="detail" className="mt-3 block text-sm font-semibold">Optional message for the next event</label>
            <input
              id="detail"
              value={detail}
              maxLength={300}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="For example: upload a clearer photo of your passport"
              className="mt-1 min-h-12 w-full rounded-md border-2 border-border bg-surface px-3 text-base"
            />
          </section>

          <section aria-labelledby="adapters-h">
            <h2 id="adapters-h" className="text-lg font-semibold">Adapter state</h2>
            {state.loading && <p role="status" className="mt-2 text-text-muted">Loading adapter state…</p>}
            <ul className="mt-2 grid gap-3 md:grid-cols-2">
              {state.data?.adapters.map((a) => <AdapterCard key={a.key} adapter={a} busy={busy} onSimulate={simulate} />)}
            </ul>
          </section>
        </div>

        <div className="space-y-4">
          <DemoScript busy={busy} onRun={demo} />

          <section aria-labelledby="remind-h" className="rounded-md border border-border bg-surface p-4 shadow-card">
            <h2 id="remind-h" className="text-lg font-semibold">Reminders</h2>
            <p className="mt-1 text-sm text-text-muted">Sends First Advantage reminders to starters in vetting who are not cleared.</p>
            <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="size-5" />
              Ignore the 24 hour window (demo)
            </label>
            <button
              type="button"
              onClick={tick}
              disabled={busy !== null}
              aria-busy={busy === "tick"}
              className="mt-2 min-h-11 w-full rounded-md border-2 border-brand bg-surface px-4 font-semibold text-brand hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              Run reminders now
            </button>
          </section>

          <section aria-labelledby="events-h" className="rounded-md border border-border bg-surface p-4 shadow-card">
            <h2 id="events-h" className="text-lg font-semibold">Recent events</h2>
            <ol className="mt-2 space-y-2 text-sm">
              {state.data?.events.map((e) => (
                <li key={e.id} className="border-b border-border pb-2 last:border-0">
                  <span className="font-semibold">{human(e.type)}</span>
                  {e.entityId && e.type.startsWith("INTEGRATION") ? ` (${e.entityId}${e.to ? `: ${e.to}` : ""})` : ""}
                  <br />
                  <time dateTime={e.at} className="text-text-muted">{new Date(e.at).toLocaleTimeString()}</time>
                </li>
              ))}
              {state.data?.events.length === 0 && <li className="text-text-muted">No events yet.</li>}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
