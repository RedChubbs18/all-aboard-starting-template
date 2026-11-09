"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/auth/use-api";
import type { StarterListResponse, StarterSummary } from "./types";
import { Alert, Button, Icon, OverdueBadge, ProgressBar, RedFlagBadge, Skeleton, EmptyState, STAGE_LABEL, formatDate } from "./ui";
import { StatusBadge } from "./ui";

const hireviewLabel = (s: StarterSummary) => (s.hireview === "FAILED" ? "First Advantage: failed" : "First Advantage: action needed");

function Issues({ s }: { s: StarterSummary }) {
  const none = !s.redFlag && !s.overdue && !s.blocked;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {s.redFlag && <RedFlagBadge label={hireviewLabel(s)} />}
      {s.overdue > 0 && <OverdueBadge label={`${s.overdue} overdue${s.overdueLm ? ` (${s.overdueLm} yours)` : ""}`} />}
      {s.blocked > 0 && <StatusBadge status="BLOCKED" />}
      {s.blocked > 1 && <span className="text-sm text-text-muted">{s.blocked} blocked</span>}
      {none && <span className="text-sm text-text-muted">On track</span>}
    </div>
  );
}

const progressLabel = (s: StarterSummary) => `${s.percent}% done`;
const href = (s: StarterSummary) => `/lm/starters/${s.id}`;

function StarterCard({ s }: { s: StarterSummary }) {
  return (
    <li>
      <Link
        href={href(s)}
        className={`flex min-h-11 flex-col gap-3 rounded-md bg-surface p-4 shadow-card hover:bg-brand-soft ${
          s.redFlag ? "border-l-4 border-danger" : "border border-border/40"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-brand-strong">{s.starterName}</h2>
            <p className="text-text-muted">
              {STAGE_LABEL[s.stage]} · Starts {formatDate(s.startDate)}
            </p>
          </div>
          <Icon name="chevron" className="mt-1 text-text-muted" />
        </div>
        <ProgressBar percent={s.percent} label={progressLabel(s)} />
        <Issues s={s} />
        {s.nextDue && (
          <p className="text-sm text-text-muted">
            Next due: {s.nextDue.title} ({formatDate(s.nextDue.dueDate)})
          </p>
        )}
      </Link>
    </li>
  );
}

function StarterTable({ rows }: { rows: StarterSummary[] }) {
  return (
    <table className="w-full overflow-hidden rounded-md bg-surface text-left shadow-card">
      <caption className="sr-only">Your starters, most urgent first</caption>
      <thead className="bg-surface-alt text-sm text-text-muted">
        <tr>
          {["Name", "Stage", "Start date", "Progress", "Issues", "Next due"].map((h) => (
            <th key={h} scope="col" className="px-4 py-3 font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border/30">
        {rows.map((s) => (
          <tr key={s.id} className={s.redFlag ? "bg-[#fbe6e4]/40" : undefined}>
            <th scope="row" className="px-4 py-3 font-semibold">
              <Link href={href(s)} className="inline-flex min-h-11 items-center text-brand underline underline-offset-2">
                {s.starterName}
              </Link>
            </th>
            <td className="px-4 py-3">{STAGE_LABEL[s.stage]}</td>
            <td className="px-4 py-3">{formatDate(s.startDate)}</td>
            <td className="w-48 px-4 py-3">
              <ProgressBar percent={s.percent} label={`${s.percent}%`} />
            </td>
            <td className="px-4 py-3">
              <Issues s={s} />
            </td>
            <td className="px-4 py-3 text-sm text-text-muted">{s.nextDue ? `${s.nextDue.title} (${formatDate(s.nextDue.dueDate)})` : "Nothing due"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StarterList() {
  const { data, error, loading, reload } = useApi<StarterListResponse>("/api/lm/starters");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const all = data?.starters ?? [];
  const rows = attentionOnly ? all.filter((s) => s.needsAttention) : all;
  const attention = all.filter((s) => s.needsAttention).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-brand-strong">Your starters</h1>
        {data && all.length > 0 && (
          <div role="group" aria-label="Filter starters" className="flex gap-2">
            <Button variant={attentionOnly ? "ghost" : "secondary"} aria-pressed={!attentionOnly} onClick={() => setAttentionOnly(false)}>
              All ({all.length})
            </Button>
            <Button variant={attentionOnly ? "secondary" : "ghost"} aria-pressed={attentionOnly} onClick={() => setAttentionOnly(true)}>
              Needs attention ({attention})
            </Button>
          </div>
        )}
      </div>

      {loading && (
        <div role="status" aria-label="Loading starters" className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}
      {error && (
        <Alert tone="danger" title="We couldn't load your starters" role="alert" action={<Button variant="secondary" onClick={reload}>Retry</Button>}>
          {error}
        </Alert>
      )}
      {data && all.length === 0 && <EmptyState title="No starters assigned yet">When a new colleague is assigned to you, they will appear here.</EmptyState>}
      {data && all.length > 0 && rows.length === 0 && <EmptyState title="Nothing needs attention">Every starter is on track.</EmptyState>}
      {rows.length > 0 && (
        <>
          <p className="sr-only" role="status">
            {rows.length} {rows.length === 1 ? "starter" : "starters"} shown
          </p>
          <ul className="space-y-3 lg:hidden">
            {rows.map((s) => (
              <StarterCard key={s.id} s={s} />
            ))}
          </ul>
          <div className="hidden lg:block">
            <StarterTable rows={rows} />
          </div>
          <p className="text-sm text-text-muted">Starters who need attention come first.</p>
        </>
      )}
    </div>
  );
}
