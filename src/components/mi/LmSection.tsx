"use client";
import type { LmLeagueRow, LmRollupRow, MajorFlag } from "@/server/mi-metrics";
import { Explain } from "./Explain";
import { days, fmtTime, percent, plural } from "./format";
import { MAJOR_FLAG, MAJOR_FLAG_LABEL, MAJOR_FLAG_RULES } from "./rules";
import { Button } from "@/components/ui/Button";
import { Badge, ResponsiveTable, Section } from "./primitives";

interface Props {
  lm: { league: LmLeagueRow[]; byTeam: LmRollupRow[]; byArea: LmRollupRow[]; flags: MajorFlag[] };
  exportBtn: (type: string, label: string) => React.ReactNode;
  onChase: (row: LmLeagueRow) => void;
}

const rollupColumns = (label: string) => [
  { key: "k", header: label, primary: true, sort: (r: LmRollupRow) => r.label, cell: (r: LmRollupRow) => r.label },
  { key: "lms", header: "Line managers", sort: (r: LmRollupRow) => r.lms, cell: (r: LmRollupRow) => r.lms },
  { key: "open", header: "Open actions", sort: (r: LmRollupRow) => r.openActions, cell: (r: LmRollupRow) => r.openActions },
  { key: "over", header: "Overdue", sort: (r: LmRollupRow) => r.overdueActions, cell: (r: LmRollupRow) => r.overdueActions },
  { key: "avg", header: "Avg days overdue", sort: (r: LmRollupRow) => r.avgDaysOverdue ?? -1, cell: (r: LmRollupRow) => days(r.avgDaysOverdue) },
  { key: "ot", header: "Done on time", sort: (r: LmRollupRow) => r.onTimePct ?? -1, cell: (r: LmRollupRow) => percent(r.onTimePct) },
  { key: "fl", header: "Major flags", sort: (r: LmRollupRow) => r.flagCount, cell: (r: LmRollupRow) => r.flagCount },
];

export function LmSection({ lm, exportBtn, onChase }: Props) {
  return (
    <Section id="lm" title="Line manager accountability" actions={<div className="flex flex-wrap gap-2">{exportBtn("lm-league", "Export league CSV")}{exportBtn("lm-flags", "Export flags CSV")}</div>}>
      <p className="text-sm text-muted">Who has overdue onboarding actions, ranked worst first. Overdue follows the same rule everywhere: an applicable line manager action that is not done, not waiting on something else, and past its due date.</p>

      <div className="mt-3 rounded-md border border-line bg-page p-3">
        <h3 className="font-semibold">Major flag rules</h3>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
          {MAJOR_FLAG_RULES.map((r) => (
            <li key={r.rule}><span className="font-semibold">{r.label}.</span> {r.text}</li>
          ))}
        </ul>
      </div>

      <h3 className="mt-4 text-lg font-bold">Major flags ({lm.flags.length})</h3>
      <div className="mt-2">
        <ResponsiveTable
          caption="Major flags for line managers"
          rows={lm.flags}
          rowKey={(r) => `${r.lmId}|${r.journeyId ?? "lm"}|${r.taskKey ?? ""}`}
          empty={<p>No major flags in this view.</p>}
          columns={[
            { key: "lm", header: "Line manager", primary: true, sort: (r) => r.lmName, cell: (r) => <>{r.lmName}<span className="block text-sm font-normal text-muted">{r.teamName}</span></> },
            { key: "what", header: "What", sort: (r) => r.title ?? "", cell: (r) => (r.title ? <>{r.title}<span className="block text-sm text-muted">for {r.starterName}</span></> : "All their starters") },
            { key: "days", header: "Longest overdue", sort: (r) => r.daysOverdue, cell: (r) => `${r.daysOverdue} d` },
            { key: "rules", header: "Rule", cell: (r) => <div className="flex flex-wrap gap-1">{r.rules.map((x) => <Badge key={x} tone="danger" icon="alert">{MAJOR_FLAG_LABEL[x]}</Badge>)}</div> },
            { key: "detail", header: "Detail", cell: (r) => r.detail },
          ]}
        />
      </div>

      <h3 className="mt-6 text-lg font-bold">League table</h3>
      <div className="mt-2">
        <ResponsiveTable
          caption="Line managers ranked by overdue actions"
          rows={lm.league}
          rowKey={(r) => r.lmId}
          empty={<p>No line managers in this view.</p>}
          columns={[
            { key: "lm", header: "Line manager", primary: true, sort: (r) => r.lmName, cell: (r) => <>{r.lmName}<span className="block text-sm font-normal text-muted">{r.teams.join(", ")}</span></> },
            { key: "act", header: "Active starters", sort: (r) => r.activeStarters, cell: (r) => r.activeStarters },
            { key: "open", header: "Open actions", sort: (r) => r.openActions, cell: (r) => r.openActions },
            { key: "over", header: "Overdue", sort: (r) => r.overdueActions, cell: (r) => (r.overdueActions ? <Badge tone="warning" icon="clock">{r.overdueActions} overdue</Badge> : "None") },
            { key: "avg", header: "Avg days overdue", sort: (r) => r.avgDaysOverdue ?? -1, cell: (r) => days(r.avgDaysOverdue) },
            { key: "ot", header: "Done on time", sort: (r) => r.onTimePct ?? -1, cell: (r) => percent(r.onTimePct) },
            { key: "old", header: "Oldest overdue", sort: (r) => r.oldestOverdue?.days ?? -1, cell: (r) => (r.oldestOverdue ? <>{r.oldestOverdue.days} d<span className="block text-sm text-muted">{r.oldestOverdue.title}, {r.oldestOverdue.starterName}</span></> : "None") },
            { key: "chase", header: "Chased", sort: (r) => r.lastChasedAt ?? "", cell: (r) => <>{r.lastChasedAt ? fmtTime(r.lastChasedAt) : "Never"}<span className="block text-sm text-muted">{plural(r.chaseCount, "time")}</span></> },
            { key: "flags", header: "Major flags", sort: (r) => r.flagCount, cell: (r) => (r.flagRules.length ? <div className="flex flex-wrap gap-1">{r.flagRules.map((x) => <Badge key={x} tone="danger" icon="alert">{MAJOR_FLAG_LABEL[x]}</Badge>)}</div> : "None") },
            {
              key: "act",
              header: "Action",
              cell: (r) =>
                r.overdueActions === 0 ? (
                  <span className="text-sm text-muted">Nothing to chase</span>
                ) : (
                  <>
                    <Button aria-disabled={!r.canChase || undefined} aria-describedby={r.canChase ? undefined : `why-${r.lmId}`} onClick={() => onChase(r)}>
                      Chase LM<span className="sr-only">: {r.lmName}</span>
                    </Button>
                    {!r.canChase && r.blockedUntil && <p id={`why-${r.lmId}`} className="mt-1 max-w-48 text-sm text-muted">Chased in the last 24 hours. Available again {fmtTime(r.blockedUntil)}.</p>}
                  </>
                ),
            },
          ]}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-lg font-bold">By business area</h3>
          <div className="mt-2"><ResponsiveTable caption="Line manager actions by business area" rows={lm.byArea} rowKey={(r) => r.key} empty={<p>No data.</p>} columns={rollupColumns("Business area")} /></div>
        </div>
        <div>
          <h3 className="text-lg font-bold">By team</h3>
          <div className="mt-2"><ResponsiveTable caption="Line manager actions by team" rows={lm.byTeam} rowKey={(r) => r.key} empty={<p>No data.</p>} columns={rollupColumns("Team")} /></div>
        </div>
      </div>

      <Explain>
        <p><span className="font-semibold">Open actions:</span> line manager actions on active starters that are applicable, not done and not locked behind another step.</p>
        <p><span className="font-semibold">Overdue:</span> open actions whose due date has passed. <span className="font-semibold">Average days overdue</span> is the mean of those, counting part days as a whole day.</p>
        <p><span className="font-semibold">Done on time:</span> of all line manager actions that are done or overdue (including completed and exited journeys), the share completed on or before the due date.</p>
        <p><span className="font-semibold">Major flags:</span> more than {MAJOR_FLAG.taskOverdueDays} days overdue; more than {MAJOR_FLAG.manyOverdue} overdue actions for one line manager; or Day 0 arrangements overdue with the start date {MAJOR_FLAG.day0WindowDays} days away or less.</p>
        <p><span className="font-semibold">Chased:</span> counted from the audit log of nudges. A line manager can be chased once every 24 hours. Team and area rows add up the same actions as the league. These figures ignore the status filter.</p>
      </Explain>
    </Section>
  );
}
