"use client";
/** Local MI primitives (the shared ui kit is owned elsewhere). Tokens only; 44px targets; visible focus. */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export const btn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-info focus-visible:ring-offset-2";
export const btnPrimary = `${btn} bg-brand text-surface hover:bg-brand-strong`;
export const btnSecondary = `${btn} border-2 border-brand bg-surface text-brand hover:bg-brand-soft`;
export const fieldClass =
  "min-h-11 w-full rounded-md border-2 border-border bg-surface px-3 text-base focus-visible:border-info focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-info/40";

export function Icon({ name }: { name: "alert" | "clock" | "check" | "x" | "download" }) {
  const d = {
    alert: "M12 3 2 21h20L12 3Zm0 6v6m0 3v.01",
    clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    check: "m4 12 5 5L20 6",
    x: "M6 6l12 12M18 6 6 18",
    download: "M12 4v11m0 0-4-4m4 4 4-4M5 20h14",
  }[name];
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const TONES = {
  danger: "bg-[#fbe6e4] text-danger",
  warning: "bg-[#fdf1d8] text-warning",
  success: "bg-[#e2f3e8] text-success",
  info: "bg-[#e4effb] text-info",
  neutral: "border border-border bg-surface text-text",
} as const;

/** Icon plus text, never colour alone. */
export function Badge({ tone, icon, children }: { tone: keyof typeof TONES; icon?: "alert" | "clock" | "check"; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-sm font-semibold ${TONES[tone]}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export function Section({ title, actions, children, id }: { title: string; actions?: ReactNode; children: ReactNode; id?: string }) {
  const hid = useId();
  return (
    <section aria-labelledby={hid} id={id} className="rounded-md bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={hid} className="text-lg font-semibold text-brand-strong">{title}</h2>
        {actions}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Native <dialog>: focus trap, Esc and focus return come for free. Bottom sheet on mobile, centred on md+. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const tid = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={tid}
      onClose={onClose}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-lg bg-surface p-4 text-text shadow-card backdrop:bg-text/50 md:m-auto md:max-w-md md:rounded-lg md:p-6"
    >
      {open && (
        <>
          <h2 id={tid} className="text-lg font-semibold text-brand-strong">{title}</h2>
          <div className="mt-3">{children}</div>
        </>
      )}
    </dialog>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Presence makes the column sortable. */
  sort?: (row: T) => string | number;
  /** Used as the card heading on mobile. */
  primary?: boolean;
}

/** Table at md+, stacked cards below. Sortable headers expose aria-sort. */
export function ResponsiveTable<T>({ caption, rows, rowKey, columns, empty }: { caption: string; rows: T[]; rowKey: (r: T) => string; columns: Column<T>[]; empty: ReactNode }) {
  const [sort, setSort] = useState<{ key: string; dir: "ascending" | "descending" } | null>(null);
  const col = sort ? columns.find((c) => c.key === sort.key) : null;
  const sorted = col?.sort
    ? [...rows].sort((a, b) => {
        const x = col.sort!(a);
        const y = col.sort!(b);
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
        return sort!.dir === "ascending" ? c : -c;
      })
    : rows;
  if (!rows.length) return <>{empty}</>;
  const primary = columns.find((c) => c.primary) ?? columns[0];
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-base">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b-2 border-border">
              {columns.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort?.key === c.key ? sort.dir : c.sort ? "none" : undefined} className="py-1 pr-3 font-semibold">
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === "ascending" ? "descending" : "ascending" }))}
                      className="inline-flex min-h-11 items-center gap-1 rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-info"
                    >
                      {c.header}
                      <span aria-hidden="true">{sort?.key === c.key ? (sort.dir === "ascending" ? "▲" : "▼") : "⇅"}</span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={rowKey(r)} className="border-b border-border/40 align-top">
                {columns.map((c) => (
                  <td key={c.key} className="py-2 pr-3">{c.cell(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden" aria-label={caption}>
        {sorted.map((r) => (
          <li key={rowKey(r)} className="rounded-md border border-border/40 bg-surface-alt p-3">
            <p className="font-semibold">{primary.cell(r)}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {columns.filter((c) => c !== primary).map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-text-muted">{c.header}</dt>
                  <dd>{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** Visible value text, e.g. "41 (85%)". */
  valueText: string;
  detail?: string;
}

/** Horizontal bars in plain HTML/CSS. Every bar shows its label and value as text. */
function Bars({ items, max }: { items: BarItem[]; max: number }) {
  return (
    <ol className="space-y-3">
      {items.map((i) => (
        <li key={i.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-medium">{i.label}</span>
            <span className="font-semibold">{i.valueText}</span>
          </div>
          <div className="mt-1 h-3 rounded-full border border-border/50 bg-surface-alt" aria-hidden="true">
            <div className="h-full rounded-full border-r-2 border-brand-strong bg-brand" style={{ width: max ? `${Math.max(i.value > 0 ? 2 : 0, (i.value / max) * 100)}%` : 0 }} />
          </div>
          {i.detail && <p className="mt-0.5 text-sm text-text-muted">{i.detail}</p>}
        </li>
      ))}
    </ol>
  );
}

/** Chart with a title, visible values, and a "View as table" alternative. */
export function ChartCard({
  title,
  summary,
  items,
  table,
  headers,
}: {
  title: string;
  summary?: string;
  items: BarItem[];
  headers: string[];
  table: (string | number)[][];
}) {
  const [asTable, setAsTable] = useState(false);
  const tid = useId();
  const max = Math.max(0, ...items.map((i) => i.value));
  return (
    <figure aria-labelledby={tid} className="rounded-md bg-surface p-4 shadow-card">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span id={tid} className="text-lg font-semibold text-brand-strong">{title}</span>
        <button type="button" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)} className={`${btnSecondary} !min-h-11 !px-3 text-sm`}>
          {asTable ? "View as chart" : "View as table"}
        </button>
      </figcaption>
      {summary && <p className="mt-1 text-sm text-text-muted">{summary}</p>}
      <div className="mt-3">
        {asTable ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-base">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="border-b-2 border-border">
                  {headers.map((h) => (
                    <th key={h} scope="col" className="py-1 pr-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map((r, i) => (
                  <tr key={i} className="border-b border-border/40">
                    {r.map((c, j) => (j === 0 ? <th key={j} scope="row" className="py-2 pr-3 font-medium">{c}</th> : <td key={j} className="py-2 pr-3">{c}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Bars items={items} max={max} />
        )}
      </div>
    </figure>
  );
}

export function Skeleton({ className = "h-24" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-surface-alt motion-reduce:animate-none ${className}`} />;
}
