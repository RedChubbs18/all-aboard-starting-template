"use client";
import { useId, useState } from "react";
import { STAGES } from "@/domain/types";
import { activeFilterCount, STATUS_FILTERS, type MiFilters } from "./filters";
import { STAGE_LABEL, STATUS_LABEL } from "./labels";
import { Button } from "@/components/ui/Button";
import { btnSecondary, fieldClass } from "./primitives";

interface Props {
  filters: MiFilters;
  options: { areas: string[]; teams: { id: string; name: string; area: string | null }[] };
  onChange: (next: MiFilters) => void;
}

/** Filter bar on desktop; collapses behind a "Filters (n)" button on mobile. */
export function FilterBar({ filters, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const n = activeFilterCount(filters);
  const set = <K extends keyof MiFilters>(k: K, v: string) => {
    const next = { ...filters };
    if (v) (next as Record<string, string>)[k] = v;
    else delete next[k];
    onChange(next);
  };
  const teams = filters.area ? options.teams.filter((t) => t.area === filters.area) : options.teams;
  const field = (id: string, label: string, control: React.ReactNode) => (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">{label}</label>
      {control}
    </div>
  );
  return (
    <section aria-label="Filters" className="rounded-md bg-card p-4 border border-line">
      <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)} className={`${btnSecondary} lg:hidden`}>
        Filters ({n})
      </button>
      <div id={panel} className={`${open ? "grid" : "hidden"} mt-3 grid-cols-1 gap-3 sm:grid-cols-2 lg:mt-0 lg:grid lg:grid-cols-4 xl:grid-cols-7 xl:items-end`}>
        {field(`${panel}-area`, "Business area", (
          <select id={`${panel}-area`} className={fieldClass} value={filters.area ?? ""} onChange={(e) => set("area", e.target.value)}>
            <option value="">All areas</option>
            {options.areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        ))}
        {field(`${panel}-team`, "Team", (
          <select id={`${panel}-team`} className={fieldClass} value={filters.team ?? ""} onChange={(e) => set("team", e.target.value)}>
            <option value="">All teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        ))}
        {field(`${panel}-stage`, "Stage", (
          <select id={`${panel}-stage`} className={fieldClass} value={filters.stage ?? ""} onChange={(e) => set("stage", e.target.value)}>
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        ))}
        {field(`${panel}-status`, "Status", (
          <select id={`${panel}-status`} className={fieldClass} value={filters.status ?? ""} onChange={(e) => set("status", e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        ))}
        {field(`${panel}-from`, "Start date from", <input id={`${panel}-from`} type="date" className={fieldClass} value={filters.from ?? ""} max={filters.to} onChange={(e) => set("from", e.target.value)} />)}
        {field(`${panel}-to`, "Start date to", <input id={`${panel}-to`} type="date" className={fieldClass} value={filters.to ?? ""} min={filters.from} onChange={(e) => set("to", e.target.value)} />)}
        <div>
          <Button
            variant="secondary"
            onClick={() => onChange({})}
            aria-disabled={n === 0 || undefined}
            aria-describedby={n === 0 ? `${panel}-clear-why` : undefined}
            className="w-full"
          >
            Clear filters
          </Button>
          {n === 0 && <span id={`${panel}-clear-why`} className="sr-only">No filters are applied.</span>}
        </div>
      </div>
    </section>
  );
}
