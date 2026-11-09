"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

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
  hireview: "First Advantage (hireview adapter)",
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
    <Card as="li" className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="font-bold">{label}</h3>
        <Badge>{adapter.mode === "MOCK" ? "Mock" : "Real"}</Badge>
      </div>
      <p className="mt-2 text-sm">
        <span className="text-muted">Status: </span>
        <strong>{human(adapter.status)}</strong>
      </p>
      {adapter.error && <p role="alert" className="mt-1 text-sm text-blocked">Unavailable: {adapter.error}</p>}
      {adapter.facts.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-sm text-muted">
          {adapter.facts.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      )}
      {buttons.length > 0 && adapter.mode === "MOCK" && (
        <div role="group" aria-labelledby={headingId} className="mt-3 flex flex-wrap gap-2">
          {buttons.map((s) => {
            const id = `${adapter.key}:${s}`;
            const current = s === adapter.status;
            return (
              <Button
                key={s}
                variant={current ? "primary" : "secondary"}
                onClick={() => onSimulate(adapter.key, s)}
                disabled={busy !== null}
                aria-pressed={current}
                busy={busy === id}
                className="px-4 py-2 text-sm"
              >
                {human(s)}
              </Button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
