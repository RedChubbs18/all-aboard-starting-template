"use client";

export interface AdapterViewData {
  key: string;
  mode: string;
  simulatable: boolean;
  statuses: string[];
  status: string;
  updatedAt: string;
  detail?: string;
  facts: string[];
  error?: string;
}

export const ADAPTER_LABELS: Record<string, string> = {
  identity: "Identity (Entra)",
  sailpoint: "SailPoint",
  firstadvantage: "First Advantage (firstadvantage adapter)",
  workday: "Workday",
  itrequest: "IT@LBG requests",
  equipment: "Equipment",
  pass: "Photo ID pass",
  booking: "Induction booking",
  photocheck: "Photo check",
  chatbot: "Chatbot",
  notification: "Notifications",
};

const human = (s: string) => s.replace(/_/g, " ");

interface Props {
  adapter: AdapterViewData;
  busy: string | null;
  onSimulate: (adapterKey: string, status: string) => void;
}

/** Only adapters with something to drive from here show buttons: single-state adapters (photocheck, notification, chatbot) are read-only. */
export function AdapterCard({ adapter, busy, onSimulate }: Props) {
  const label = ADAPTER_LABELS[adapter.key] ?? adapter.key;
  const buttons = adapter.statuses.length > 1 ? adapter.statuses : [];
  const headingId = `adapter-${adapter.key}`;
  return (
    <li className="rounded-md border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="font-semibold">{label}</h3>
        <span className="rounded-sm border border-border px-2 py-0.5 text-sm font-semibold">{adapter.mode === "MOCK" ? "Mock" : "Real"}</span>
      </div>
      <p className="mt-2 text-sm">
        <span className="text-text-muted">Status: </span>
        <strong>{human(adapter.status)}</strong>
      </p>
      {adapter.error && <p role="alert" className="mt-1 text-sm text-danger">Unavailable: {adapter.error}</p>}
      {adapter.facts.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-sm text-text-muted">
          {adapter.facts.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      )}
      {buttons.length > 0 && adapter.mode === "MOCK" && (
        <div role="group" aria-labelledby={headingId} className="mt-3 flex flex-wrap gap-2">
          {buttons.map((s) => {
            const id = `${adapter.key}:${s}`;
            const current = s === adapter.status;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onSimulate(adapter.key, s)}
                disabled={busy !== null}
                aria-pressed={current}
                aria-busy={busy === id}
                className={`min-h-11 rounded-md px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
                  current ? "bg-brand text-surface" : "border-2 border-brand bg-surface text-brand hover:bg-brand-soft"
                }`}
              >
                {human(s)}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}
