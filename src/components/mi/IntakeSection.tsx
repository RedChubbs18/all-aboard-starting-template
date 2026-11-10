"use client";
import type { IntakeOutlook } from "@/server/mi-metrics";
import { Explain } from "./Explain";
import { fmtDate, fmtShortDate, percent, plural } from "./format";
import { stageLabel } from "./labels";
import { READINESS } from "./rules";
import { Badge, ChartCard, ResponsiveTable, Section } from "./primitives";

interface Props {
  intake: IntakeOutlook;
  exportBtn: (type: string, label: string) => React.ReactNode;
}

export function IntakeSection({ intake, exportBtn }: Props) {
  return (
    <Section id="intake" title="Intake outlook (next 13 weeks)" actions={exportBtn("intake", "Export intake CSV")}>
      <p>
        <span className="font-semibold">{plural(intake.totalStarters, "starter")} due to start</span>{" "}
        <span className="text-muted">{intake.readinessPct === null ? "" : `, ${intake.readinessPct}% of their pre-start gating tasks done`}</span>
      </p>
      <div className="mt-3">
        <ChartCard
          title="Starters by start week"
          summary="Weeks begin on Monday. Readiness is the share of pre-start gating tasks done."
          headers={["Week beginning", "Starters", "Readiness", "Behind"]}
          items={intake.weeks.map((w) => ({
            key: w.weekStart,
            label: `Week of ${fmtShortDate(w.weekStart)}`,
            value: w.starters,
            valueText: `${plural(w.starters, "starter")}${w.readinessPct === null ? "" : `, ${w.readinessPct}% ready`}`,
            detail: w.behind ? `${w.behind} behind` : undefined,
          }))}
          table={intake.weeks.map((w) => [fmtShortDate(w.weekStart), w.starters, percent(w.readinessPct), w.behind])}
        />
      </div>
      <h3 className="mt-6 text-lg font-bold">Starters and readiness</h3>
      <div className="mt-2">
        <ResponsiveTable
          caption="Upcoming starters and their readiness"
          rows={intake.starters}
          rowKey={(r) => r.journeyId}
          empty={<p>Nobody is due to start in the next 13 weeks in this view.</p>}
          columns={[
            { key: "name", header: "Starter", primary: true, sort: (r) => r.starterName, cell: (r) => <>{r.starterName}<span className="block text-sm font-normal text-muted">{r.teamName}, LM {r.lmName}</span></> },
            { key: "start", header: "Starts", sort: (r) => r.startDate, cell: (r) => <>{fmtDate(r.startDate)}<span className="block text-sm text-muted">in {r.daysToStart} d</span></> },
            { key: "stage", header: "Stage", sort: (r) => r.stage, cell: (r) => stageLabel(r.stage) },
            { key: "ready", header: "Readiness", sort: (r) => r.readinessPct, cell: (r) => `${r.readinessPct}% (${r.done} of ${r.total})` },
            { key: "flag", header: "Status", sort: (r) => (r.behind ? 1 : 0), cell: (r) => (r.behind ? <Badge tone="danger" icon="alert">Behind</Badge> : <Badge tone="success" icon="check">On track</Badge>) },
          ]}
        />
      </div>
      <Explain>
        <p><span className="font-semibold">Start week:</span> active starters with a start date from today to the end of the 13th week, grouped by the Monday of their start week.</p>
        <p><span className="font-semibold">Readiness:</span> gating tasks in the stages before Day 0 (conditional offer, vetting, unconditional offer) that apply to the starter and are done, over all of them. A week&apos;s figure pools its starters&apos; tasks.</p>
        <p><span className="font-semibold">Behind:</span> starting within {READINESS.behindWithinDays} days with readiness under {READINESS.behindBelowPct}%.</p>
        <p>These figures ignore the status filter; the date range and other filters apply.</p>
      </Explain>
    </Section>
  );
}
