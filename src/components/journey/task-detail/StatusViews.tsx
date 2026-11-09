"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, Clock, ExternalLink, RefreshCw, XCircle, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ContactCard } from "@/components/ui/ContactCard";
import { cn } from "@/components/ui/cn";
import type { Detail, TaskDetailResponse } from "../detail-types";
import { formatDateTime } from "../format";

type Hv = Extract<Detail, { kind: "firstadvantage" }>["status"];

const HV: Record<Hv["status"], { label: string; Icon: LucideIcon; cls: string; what: string }> = {
  not_started: {
    label: "Not started",
    Icon: CircleDashed,
    cls: "bg-surface-alt text-text-muted border border-border",
    what: "Your vetting hasn't started yet. First Advantage will contact you when it is time to begin.",
  },
  in_progress: {
    label: "In progress",
    Icon: Clock,
    cls: "bg-brand-soft text-brand",
    what: "First Advantage is working through your checks. Nothing more to do right now unless they ask.",
  },
  action_needed: {
    label: "Action needed",
    Icon: AlertTriangle,
    cls: "bg-warning-soft text-warning",
    what: "First Advantage needs something from you before they can carry on.",
  },
  cleared: {
    label: "Cleared",
    Icon: CheckCircle2,
    cls: "bg-success-soft text-success",
    what: "Your vetting is complete. You can move on to the next stage.",
  },
  failed: {
    label: "Failed",
    Icon: XCircle,
    cls: "bg-danger-soft text-danger",
    what: "Your vetting could not be completed. People & Places will contact you to talk it through.",
  },
};

/** FR-2.3: vetting status chip with the five states. The system completes this task; there is no action button. */
export function FirstAdvantagePanel({ data, onChanged }: { data: TaskDetailResponse; onChanged: () => void | Promise<void> }) {
  const detail = data.detail as Extract<Detail, { kind: "firstadvantage" }>;
  const s = detail.status;
  const meta = HV[s.status];
  const [busy, setBusy] = useState(false);
  const attention = s.status === "action_needed" || s.status === "failed";
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">First Advantage vetting status</p>
        <span className={cn("inline-flex items-center gap-2 rounded-md px-3 py-2 text-lg font-semibold", meta.cls)}>
          <meta.Icon aria-hidden className="size-6" />
          {meta.label}
        </span>
        <h3 className="font-semibold">What this means</h3>
        <p>{meta.what}</p>
        <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
          <span>Last checked {formatDateTime(s.updatedAt)}</span>
          <Button
            variant="ghost"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await onChanged();
              setBusy(false);
            }}
          >
            <RefreshCw aria-hidden className="size-5" />
            Refresh
          </Button>
        </div>
      </Card>

      {attention && (
        <Alert tone={s.status === "failed" ? "danger" : "warning"} live="alert" title={s.status === "failed" ? "Your vetting needs a conversation" : "Action needed"}>
          <p>{s.status === "failed" ? "Please speak to People & Places. They are ready to help." : "Open First Advantage to see what is needed and complete it."}</p>
          {s.status === "action_needed" && (
            <ButtonLink href={s.actionUrl} external variant="primary" className="mt-2">
              Open First Advantage
              <ExternalLink aria-hidden className="size-5" />
            </ButtonLink>
          )}
        </Alert>
      )}

      {/* FR-2.2: always visible on the vetting stage */}
      {data.journey.pnp && data.task.stage === "PEV" && (
        <section aria-label="People and Places support">
          <h3 className="mb-2 font-semibold">Need help with your vetting?</h3>
          <ContactCard name={data.journey.pnp.name} role="People & Places" upn={data.journey.pnp.upn} photoUrl={data.journey.pnp.photoUrl} variant="compact" />
        </section>
      )}
    </div>
  );
}

/** SYSTEM tasks (FR-3.1, 3.2, 3.3, 3.10): read-only status, completed by the integration. */
export function SystemStatus({ data }: { data: TaskDetailResponse }) {
  const d = data.detail as Extract<Detail, { kind: "system" }>;
  const t = data.task;
  const tone = t.status === "DONE" ? "success" : t.status === "BLOCKED" ? "danger" : "neutral";
  return (
    <Card className="space-y-2">
      <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">Handled automatically</p>
      <p>
        This step is completed by <strong>{d.provider}</strong>. There is nothing for you to do.
      </p>
      <p className="flex flex-wrap items-center gap-2">
        Status: <Badge tone={tone}>{d.statusText.charAt(0).toUpperCase() + d.statusText.slice(1)}</Badge>
        {d.updatedAt && <span className="text-sm text-text-muted">updated {formatDateTime(d.updatedAt)}</span>}
      </p>
      {t.key === "colleague-file-id-created" && <p className="text-sm text-text-muted">Your Colleague File ID is issued by SailPoint. IT requests unlock once it exists.</p>}
      {t.key === "epture-access-granted" && <p className="text-sm text-text-muted">Details of Epture access are still being confirmed.</p>}
    </Card>
  );
}

const TRAIN: Record<string, { label: string; tone: "neutral" | "info" | "success" }> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  COMPLETE: { label: "Complete", tone: "success" },
};

/** FR-3.14 / FR-4.3: training list from Workday (the system of record) with status. */
export function TrainingList({ data }: { data: TaskDetailResponse }) {
  const d = data.detail as Extract<Detail, { kind: "training" }>;
  const done = d.items.filter((i) => i.status === "COMPLETE").length;
  return (
    <div>
      <h3 className="font-semibold">
        Mandatory training{" "}
        <span className="font-normal text-text-muted">
          ({done} of {d.items.length} complete)
        </span>
      </h3>
      <ul className="mt-2 space-y-2">
        {d.items.map((i) => (
          <Card as="li" key={i.id} className="flex items-center justify-between gap-3 p-3">
            <span>
              <span className="block font-medium">{i.title}</span>
              {i.dueDate && <span className="text-sm text-text-muted">due {formatDateTime(i.dueDate).split(",")[0]}</span>}
            </span>
            <Badge tone={TRAIN[i.status]?.tone ?? "neutral"}>{TRAIN[i.status]?.label ?? i.status}</Badge>
          </Card>
        ))}
        {d.items.length === 0 && <li className="text-text-muted">No training has been assigned yet.</li>}
      </ul>
      <p className="mt-2 text-sm text-text-muted">Workday is the record of your training. Status here refreshes when you open this page.</p>
    </div>
  );
}
