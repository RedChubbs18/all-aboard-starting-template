/** Filter model shared by the page (URL query) and the API. Pure: safe in client bundles. */
import { STAGES, type Stage } from "@/domain/types";

export const STATUS_FILTERS = ["active", "completed", "exited", "flagged"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export interface MiFilters {
  stage?: Stage;
  status?: StatusFilter;
  from?: string; // YYYY-MM-DD, start date >=
  to?: string; // YYYY-MM-DD, start date <=
  area?: string;
  team?: string; // team id
}

const isoDate = (v: string | null): string | undefined => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  return Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) ? undefined : v;
};
const text = (v: string | null): string | undefined => (v && v.trim() ? v.trim().slice(0, 100) : undefined);

/** Parses and validates filter query params. Unknown or invalid values are dropped. */
export function parseFilters(sp: URLSearchParams): MiFilters {
  const stage = sp.get("stage");
  const status = sp.get("status");
  const f: MiFilters = {};
  if (stage && (STAGES as readonly string[]).includes(stage)) f.stage = stage as Stage;
  if (status && (STATUS_FILTERS as readonly string[]).includes(status)) f.status = status as StatusFilter;
  const from = isoDate(sp.get("from"));
  const to = isoDate(sp.get("to"));
  if (from) f.from = from;
  if (to) f.to = to;
  const area = text(sp.get("area"));
  const team = text(sp.get("team"));
  if (area) f.area = area;
  if (team) f.team = team;
  return f;
}

export function filtersToQuery(f: MiFilters): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) sp.set(k, v);
  return sp.toString();
}

export const activeFilterCount = (f: MiFilters): number => Object.values(f).filter(Boolean).length;
