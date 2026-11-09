"use client";
/** MI building blocks (sections, charts, responsive table). Buttons, fields, badges, modals and skeletons are the shared ui kit. */
import { AlertTriangle, Check, Clock, Download, X, type LucideIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Badge as SharedBadge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { controlClass } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";

export { Skeleton } from "@/components/ui/Skeleton";

export const btnPrimary = buttonClass("primary");
export const btnSecondary = buttonClass("secondary");
export const fieldClass = controlClass;

const ICONS: Record<"alert" | "clock" | "check" | "x" | "download", LucideIcon> = { alert: AlertTriangle, clock: Clock, check: Check, x: X, download: Download };

export function Icon({ name }: { name: keyof typeof ICONS }) {
  const Cmp = ICONS[name];
  return <Cmp aria-hidden className="size-5" strokeWidth={1.8} />;
}

const TONE = { danger: "danger", warning: "warning", success: "success", info: "info", neutral: "neutral" } as const;

/** Icon plus text, never colour alone. */
export function Badge({ tone, icon, children }: { tone: keyof typeof TONE; icon?: "alert" | "clock" | "check"; children: ReactNode }) {
  return (
    <SharedBadge tone={TONE[tone]}>
      {icon && <Icon name={icon} />}
      {children}
    </SharedBadge>
  );
}

export function Section({ title, actions, children, id }: { title: string; actions?: ReactNode; children: ReactNode; id?: string }) {
  const hid = useId();
  return (
    <Card as="section" aria-labelledby={hid} id={id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={hid} className="text-xl font-bold">{title}</h2>
        {actions}
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

/** The shared centred dialog (native <dialog>: focus trap, Esc and focus return). */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} variant="dialog">
      {children}
    </Sheet>
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
            <tr className="border-b border-line">
              {columns.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort?.key === c.key ? sort.dir : c.sort ? "none" : undefined} className="py-1 pr-3 font-semibold">
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === "ascending" ? "descending" : "ascending" }))}
                      className="inline-flex min-h-11 items-center gap-1 rounded-sm font-semibold"
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
              <tr key={rowKey(r)} className="border-b border-line align-top">
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
          <li key={rowKey(r)} className="rounded-md border border-line bg-card p-3">
            <p className="font-semibold">{primary.cell(r)}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {columns.filter((c) => c !== primary).map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-muted">{c.header}</dt>
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
            <span className="text-sm text-muted">{i.label}</span>
            <span className="text-sm font-bold">{i.valueText}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-track" aria-hidden="true">
            <div className="h-full rounded-full bg-sage" style={{ width: max ? `${Math.max(i.value > 0 ? 2 : 0, (i.value / max) * 100)}%` : 0 }} />
          </div>
          {i.detail && <p className="mt-0.5 text-sm text-muted">{i.detail}</p>}
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
    <figure aria-labelledby={tid} className="rounded-md border border-line bg-card px-[22px] py-5">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span id={tid} className="text-lg font-bold">{title}</span>
        <button type="button" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)} className={buttonClass("secondary", "md", "px-3 text-sm")}>
          {asTable ? "View as chart" : "View as table"}
        </button>
      </figcaption>
      {summary && <p className="mt-1 text-sm text-muted">{summary}</p>}
      <div className="mt-3">
        {asTable ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-base">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="border-b border-line">
                  {headers.map((h) => (
                    <th key={h} scope="col" className="py-1 pr-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map((r, i) => (
                  <tr key={i} className="border-b border-line">
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
