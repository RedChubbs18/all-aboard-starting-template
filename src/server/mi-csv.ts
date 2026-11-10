/** CSV helpers for the MI export. Injection-safe and RFC 4180 escaped. */
import { reasonLabel, sourceLabel, stageLabel } from "@/components/mi/labels";
import { EARLY_SIGNAL_LABEL, MAJOR_FLAG_LABEL } from "@/components/mi/rules";
import type { ExitRow, FunnelRow, Issue, JourneyRow, Overview } from "./mi-service";

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

export const EXPORT_TYPES = ["journeys", "issues", "exits", "funnel", "lm-league", "lm-flags", "attrition", "early-warning", "bottlenecks", "vetting", "intake"] as const;
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
    ["Stage", "Reached", "Percent of first stage", "Completed stays", "Median days in stage", "90th percentile days in stage", "Average days in stage"],
    rows.map((r) => [stageLabel(r.stage), r.reached, r.pct, r.stays, r.medianDays, r.p90Days, r.avgDays]),
  );

// ---- D36 sections. Names are line managers and starters only; no comments or other free text.

export const lmLeagueCsv = (o: Overview) =>
  toCsv(
    ["Line manager", "Teams", "Business areas", "Active starters", "Open LM actions", "Overdue LM actions", "Average days overdue", "Done on time (%)", "Oldest overdue action", "Oldest overdue (days)", "Last chased", "Times chased", "Major flags"],
    o.lm.league.map((r) => [r.lmName, r.teams.join("; "), r.areas.join("; "), r.activeStarters, r.openActions, r.overdueActions, r.avgDaysOverdue, r.onTimePct, r.oldestOverdue ? `${r.oldestOverdue.title} (${r.oldestOverdue.starterName})` : "", r.oldestOverdue?.days, day(r.lastChasedAt), r.chaseCount, r.flagRules.map((x) => MAJOR_FLAG_LABEL[x]).join("; ")]),
  );

export const lmFlagsCsv = (o: Overview) =>
  toCsv(
    ["Line manager", "Team", "Business area", "Starter", "Action", "Days overdue", "Rules", "Detail"],
    o.lm.flags.map((r) => [r.lmName, r.teamName, r.area, r.starterName, r.title, r.daysOverdue, r.rules.map((x) => MAJOR_FLAG_LABEL[x]).join("; "), r.detail]),
  );

/** Every attrition breakdown in one long table: Breakdown, Group, Count, Base, Rate (%). */
export const attritionCsv = (o: Overview) => {
  const a = o.attrition;
  const rows: Cell[][] = [
    ...a.monthly.map((m) => ["Month", m.month, m.exits, m.offers, m.cohortRatePct]),
    ...a.byStage.map((r) => ["Stage reached", stageLabel(r.stage), r.exits, r.reached, r.ratePct]),
    ...a.byReason.flatMap((r) => [
      ["Reason (colleague-supplied)", reasonLabel(r.key), r.colleague, a.exits, a.exits ? Math.round((r.colleague / a.exits) * 100) : 0],
      ["Reason (P&P-recorded)", reasonLabel(r.key), r.pnp, a.exits, a.exits ? Math.round((r.pnp / a.exits) * 100) : 0],
      ...(r.unknown ? [["Reason (source not recorded)", reasonLabel(r.key), r.unknown, a.exits, Math.round((r.unknown / a.exits) * 100)] as Cell[]] : []),
    ]),
    ...a.byArea.map((r) => ["Business area", r.label, r.exits, r.starters, r.ratePct]),
    ...a.byTeam.map((r) => ["Team", r.label, r.exits, r.starters, r.ratePct]),
    ...a.byLeadTime.map((r) => ["Exit timing", r.label, r.exits, a.exits, a.exits ? Math.round((r.exits / a.exits) * 100) : 0]),
  ];
  return toCsv(["Breakdown", "Group", "Exits", "Base", "Rate (%)"], rows);
};

export const earlyWarningCsv = (o: Overview) =>
  toCsv(
    ["Starter", "Team", "Line manager", "Stage", "Start date", "Days to start", "Level", "Signals"],
    o.attrition.earlyWarning.map((r) => [r.starterName, r.teamName, r.lmName, stageLabel(r.stage), day(r.startDate), r.daysToStart, r.level === "HIGH" ? "High" : "Watch", r.signals.map((x) => `${EARLY_SIGNAL_LABEL[x.kind]} (${x.detail})`).join("; ")]),
  );

export const bottlenecksCsv = (o: Overview) =>
  toCsv(
    ["Task", "Owner", "Stage", "Starters it applies to", "Overdue now", "Blocked now", "Completed late", "Affected", "Affected (%)"],
    o.flow.tasks.map((r) => [r.title, r.owner, stageLabel(r.stage), r.journeys, r.overdueNow, r.blockedNow, r.lateDone, r.affected, r.affectedPct]),
  );

export const vettingCsv = (o: Overview) => {
  const v = o.flow.vetting;
  return toCsv(
    ["Measure", "Value"],
    [
      ["Vettings cleared", v.cleared],
      ["Median days, request to cleared", v.medianDays],
      ["90th percentile days", v.p90Days],
      ["Average days", v.avgDays],
      ["Cleared vettings that needed starter action (%)", v.withActionNeeded.pct],
      ["Average days waiting on the starter", v.avgActionNeededDays],
      ...v.inFlight.map((r) => [`In flight: ${r.starterName} (${r.teamName})`, `${r.waitingDays} days waiting${r.actionNeededDays !== null ? `, ${r.actionNeededDays} days action needed` : ""}`] as Cell[]),
    ],
  );
};

export const intakeCsv = (o: Overview) =>
  toCsv(
    ["Starter", "Team", "Line manager", "Stage", "Start date", "Days to start", "Gating tasks done", "Gating tasks total", "Readiness (%)", "Behind", "Behind because"],
    o.intake.starters.map((r) => [r.starterName, r.teamName, r.lmName, stageLabel(r.stage), day(r.startDate), r.daysToStart, r.done, r.total, r.readinessPct, r.behind ? "Yes" : "No", r.behindReasons.join("; ")]),
  );
