"use client";
import type { Overview } from "@/server/mi-service";
import { Explain } from "./Explain";
import { days, plural } from "./format";
import { OWNER_LABEL, STAGE_LABEL, stageLabel } from "./labels";
import { ChartCard, ResponsiveTable, Section } from "./primitives";

interface Props {
  data: Overview;
  exportBtn: (type: string, label: string) => React.ReactNode;
  empty: React.ReactNode;
}

export function FlowSection({ data, exportBtn, empty }: Props) {
  const total = data.journeys.length;
  const v = data.flow.vetting;
  const stats: { label: string; value: string }[] = [
    { label: "Vettings cleared", value: String(v.cleared) },
    { label: "Median days to clear", value: days(v.medianDays) },
    { label: "90th percentile days", value: days(v.p90Days) },
    { label: "Needed starter action", value: v.cleared ? `${v.withActionNeeded.pct}%` : "No data" },
  ];
  return (
    <Section id="flow" title="Flow and bottlenecks" actions={<div className="flex flex-wrap gap-2">{exportBtn("funnel", "Export stages CSV")}{exportBtn("bottlenecks", "Export tasks CSV")}{exportBtn("vetting", "Export vetting CSV")}</div>}>
      {total === 0 ? (
        empty
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Starters by current stage"
            summary={`${plural(total, "starter")} in this view`}
            headers={["Stage", "Starters", "Share"]}
            items={data.byStage.map((s) => ({ key: s.stage, label: STAGE_LABEL[s.stage], value: s.count, valueText: `${s.count} (${Math.round((s.count / total) * 100)}%)` }))}
            table={data.byStage.map((s) => [STAGE_LABEL[s.stage], s.count, `${Math.round((s.count / total) * 100)}%`])}
          />
          <ChartCard
            title="Time in each stage"
            summary="Median and 90th percentile days for stays that have finished, with how many starters reached each stage."
            headers={["Stage", "Reached", "% of first stage", "Median days", "90th percentile days", "Average days", "Completed stays"]}
            items={data.funnel.map((r) => ({
              key: r.stage,
              label: STAGE_LABEL[r.stage],
              value: r.reached,
              valueText: `${r.reached} (${r.pct}%)`,
              detail: `Median ${days(r.medianDays)}, 90th percentile ${days(r.p90Days)}, average ${days(r.avgDays)}`,
            }))}
            table={data.funnel.map((r) => [STAGE_LABEL[r.stage], r.reached, `${r.pct}%`, days(r.medianDays), days(r.p90Days), days(r.avgDays), r.stays])}
          />
        </div>
      )}

      <h3 className="mt-6 text-lg font-bold">Tasks most often overdue or blocked</h3>
      <div className="mt-2">
        <ResponsiveTable
          caption="Top 10 tasks most often overdue, blocked or completed late"
          rows={data.flow.tasks}
          rowKey={(r) => r.key}
          empty={<p>No task is overdue, blocked or late in this view.</p>}
          columns={[
            { key: "task", header: "Task", primary: true, sort: (r) => r.title, cell: (r) => <>{r.title}<span className="block text-sm font-normal text-muted">{stageLabel(r.stage)}, {OWNER_LABEL[r.owner] ?? r.owner}</span></> },
            { key: "affected", header: "Affected", sort: (r) => r.affected, cell: (r) => `${r.affected} of ${r.journeys} (${r.affectedPct}%)` },
            { key: "over", header: "Overdue now", sort: (r) => r.overdueNow, cell: (r) => r.overdueNow },
            { key: "blocked", header: "Blocked now", sort: (r) => r.blockedNow, cell: (r) => r.blockedNow },
            { key: "late", header: "Completed late", sort: (r) => r.lateDone, cell: (r) => r.lateDone },
          ]}
        />
      </div>

      <h3 className="mt-6 text-lg font-bold">Vetting duration (First Advantage)</h3>
      <p className="text-sm text-muted">From the vetting request to First Advantage clearing the starter.</p>
      <ul className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <li key={s.label} className="rounded-md border border-line bg-card px-4 py-3">
            <p className="text-2xl font-extrabold leading-tight text-ink">{s.value}</p>
            <p className="text-sm text-muted">{s.label}</p>
          </li>
        ))}
      </ul>
      {v.avgActionNeededDays !== null && <p className="mt-2 text-sm">Cleared vettings that needed starter action spent {v.avgActionNeededDays} days waiting on the starter on average.</p>}
      <div className="mt-3">
        <ResponsiveTable
          caption="Starters currently in vetting"
          rows={v.inFlight}
          rowKey={(r) => r.journeyId}
          empty={<p>Nobody is in vetting in this view.</p>}
          columns={[
            { key: "name", header: "In vetting now", primary: true, sort: (r) => r.starterName, cell: (r) => <>{r.starterName}<span className="block text-sm font-normal text-muted">{r.teamName}</span></> },
            { key: "wait", header: "Days in vetting", sort: (r) => r.waitingDays, cell: (r) => `${r.waitingDays} d` },
            { key: "action", header: "Days waiting on starter", sort: (r) => r.actionNeededDays ?? -1, cell: (r) => (r.actionNeededDays === null ? "None" : `${r.actionNeededDays} d`) },
          ]}
        />
      </div>

      <Explain>
        <p><span className="font-semibold">Time in stage:</span> from the event log. A stay starts when the journey enters the stage and ends when it enters the next one (or exits or completes). Stays still open are left out. The 90th percentile is the value that 9 in 10 stays are at or below (linear interpolation).</p>
        <p><span className="font-semibold">Tasks most often late:</span> for each task template, journeys where it is overdue now, blocked now, or was completed after its due date, divided by the journeys it applies to. A blocked task is not also counted as overdue. Ranked by count, then share.</p>
        <p><span className="font-semibold">Vetting duration:</span> the journey entering the vetting stage (when First Advantage is asked to contact the starter) to the first First Advantage &quot;cleared&quot; event. Waiting on the starter is the time spent in &quot;action needed&quot; until the next status change.</p>
        <p>These figures ignore the status filter, so completed and exited journeys are included. Only the stage chart follows it.</p>
      </Explain>
    </Section>
  );
}
