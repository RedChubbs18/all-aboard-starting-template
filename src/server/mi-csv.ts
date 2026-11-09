/** CSV helpers for the MI export. Injection-safe and RFC 4180 escaped. */
import { reasonLabel, sourceLabel, stageLabel } from "@/components/mi/labels";
import type { ExitRow, FunnelRow, Issue, JourneyRow } from "./mi-service";

export type Cell = string | number | boolean | null | undefined;

/**
 * Cells beginning with = + - @ (or tab / CR) are treated as formulas by spreadsheets,
 * so text cells get a leading apostrophe. Real numbers are left alone.
 */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = typeof v === "boolean" ? String(v) : v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export const EXPORT_TYPES = ["journeys", "issues", "exits", "funnel"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** Name and work email only: no other personal data leaves the app. */
export const journeysCsv = (rows: JourneyRow[]) =>
  toCsv(
    ["Starter", "Work email", "Line manager", "Team", "Business area", "Stage", "Status", "Flagged", "Flag reason", "Start date", "Tasks done", "Tasks total"],
    rows.map((r) => [r.starterName, r.workEmail, r.lmName, r.teamName, r.area, stageLabel(r.stage), r.status, r.flagged ? "Yes" : "No", r.flagReason, day(r.startDate), r.doneTasks, r.totalTasks]),
  );

export const issuesCsv = (rows: Issue[]) =>
  toCsv(
    ["Starter", "Stage", "Task", "Issue", "Owner", "Days overdue", "Reason", "Line manager", "Routes to"],
    rows.map((r) => [r.starterName, stageLabel(r.stage), r.title, r.kind, r.owner, r.daysOverdue, r.blockedReason, r.lmName, r.routeLabel]),
  );

/** Comments are free text and may hold personal data, so they are only included on request. */
export const exitsCsv = (rows: ExitRow[], opts: { includeComments?: boolean } = {}) =>
  toCsv(
    ["Starter", "Work email", "Stage reached", "Reason", "Reason source", "Exit date", ...(opts.includeComments ? ["Comment"] : [])],
    rows.map((r) => [r.starterName, r.workEmail, stageLabel(r.stage), reasonLabel(r.reason), sourceLabel(r.reasonSource), day(r.exitedAt), ...(opts.includeComments ? [r.comment] : [])]),
  );

export const funnelCsv = (rows: FunnelRow[]) =>
  toCsv(
    ["Stage", "Reached", "Percent of first stage", "Completed stays", "Median days in stage", "Average days in stage"],
    rows.map((r) => [stageLabel(r.stage), r.reached, r.pct, r.stays, r.medianDays, r.avgDays]),
  );
