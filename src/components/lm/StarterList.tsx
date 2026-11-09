"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/auth/use-api";
import { Chip, ChipRow } from "@/components/ui/Chip";
import type { StarterListResponse, StarterSummary } from "./types";
import { Alert, Button, Icon, OverdueBadge, ProgressBar, RedFlagBadge, Skeleton, EmptyState, STAGE_LABEL, formatDate } from "./ui";
import { StatusBadge } from "./ui";

const firstAdvantageLabel = (s: StarterSummary) => (s.firstadvantage === "FAILED" ? "First Advantage: failed" : "First Advantage: action needed");

function Issues({ s }: { s: StarterSummary }) {
  const none = !s.redFlag && !s.overdue && !s.blocked;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {s.redFlag && <RedFlagBadge label={firstAdvantageLabel(s)} />}
      {s.overdue > 0 && <OverdueBadge label={`${s.overdue} overdue${s.overdueLm ? ` (${s.overdueLm} yours)` : ""}`} />}
      {s.blocked > 0 && <StatusBadge status="BLOCKED" />}
      {s.blocked > 1 && <span className="text-sm text-muted">{s.blocked} blocked</span>}
      {none && <span className="text-sm text-muted">On track</span>}
    </div>
  );
}

const progressLabel = (s: StarterSummary) => `${s.percent}% done`;
const href = (s: StarterSummary) => `/lm/starters/${s.id}`;

/** One manager row (STYLE section 14): name and stage left, 14px bar in the middle, status right. Red bar when overdue. */
function StarterRow({ s }: { s: StarterSummary }) {
  return (
    <li className="border-t border-line first:border-t-0">
      <Link
        href={href(s)}
        className={`grid min-h-14 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-[22px] py-4 hover:bg-page md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] ${
          s.redFlag ? "border-l-4 border-l-blocked" : ""
        }`}
      >
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold">{s.starterName}</h2>
          <p className="text-sm text-muted">
            {STAGE_LABEL[s.stage]} · Starts {formatDate(s.startDate)}
          </p>
        </div>
        <Icon name="chevron" className="text-muted md:order-last" />
        <div className="col-span-2 md:col-span-1">
          <ProgressBar percent={s.percent} overdue={s.overdue > 0} label={progressLabel(s)} />
        </div>
        <div className="col-span-2 space-y-1 md:col-span-1">
          <Issues s={s} />
          {s.nextDue && (
            <p className="text-sm text-muted">
              Next due: {s.nextDue.title} ({formatDate(s.nextDue.dueDate)})
            </p>
          )}
        </div>
      </Link>
    </li>
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
      <h1 className="text-[28px] font-bold leading-tight text-ink">Your starters</h1>
      {data && all.length > 0 && (
        <ChipRow label="Filter starters">
          <Chip selected={!attentionOnly} onClick={() => setAttentionOnly(false)}>
            All ({all.length})
          </Chip>
          <Chip selected={attentionOnly} onClick={() => setAttentionOnly(true)}>
            Needs attention ({attention})
          </Chip>
        </ChipRow>
      )}

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
          <ul aria-label="Your starters, most urgent first" className="overflow-hidden rounded-md border border-line bg-card">
            {rows.map((s) => (
              <StarterRow key={s.id} s={s} />
            ))}
          </ul>
          <p className="text-sm text-muted">Starters who need attention come first.</p>
        </>
      )}
    </div>
  );
}
