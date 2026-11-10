"use client";
import type { ExitReport, Overview } from "@/server/mi-service";
import { Explain } from "./Explain";
import { fmtDate, fmtMonth, plural } from "./format";
import { STAGE_LABEL, reasonLabel, sourceLabel, stageLabel } from "./labels";
import { EARLY_SIGNAL_LABEL, EARLY_SIGNAL_RULES, EARLY_WARNING } from "./rules";
import { Badge, ChartCard, ResponsiveTable, Section } from "./primitives";

interface Props {
  attrition: Overview["attrition"];
  exits: ExitReport;
  exportBtn: (type: string, label: string) => React.ReactNode;
}

export function AttritionSection({ attrition: a, exits, exportBtn }: Props) {
  const colleague = exits.colleagueSupplied;
  return (
    <Section id="attrition" title="Onboarding attrition" actions={<div className="flex flex-wrap gap-2">{exportBtn("attrition", "Export attrition CSV")}{exportBtn("exits", "Export exits CSV")}</div>}>
      <p>
        <span className="font-semibold">{plural(a.exits, "exit")} from {plural(a.starters, "starter")} ({a.exitRatePct}%)</span>{" "}
        <span className="text-muted">
          {a.exits ? `${colleague.pct}% of reasons were supplied by the colleague (${colleague.count} of ${colleague.total}); the rest were recorded by P&P or have no source.` : "No exits in this view."}
        </span>
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Exits by month"
          summary="Exits in the month, against offers accepted that month."
          headers={["Month", "Exits", "Offers accepted", "Cohort exit rate"]}
          items={a.monthly.map((m) => ({ key: m.month, label: fmtMonth(m.month), value: m.exits, valueText: `${plural(m.exits, "exit")}`, detail: `${m.offers} offers accepted; ${m.cohortRatePct}% of that cohort has exited` }))}
          table={a.monthly.map((m) => [fmtMonth(m.month), m.exits, m.offers, `${m.cohortRatePct}%`])}
        />
        <ChartCard
          title="Exit rate by stage"
          summary="Exits at each stage, as a share of starters who reached it."
          headers={["Stage", "Exits", "Reached", "Exit rate"]}
          items={a.byStage.map((r) => ({ key: r.stage, label: STAGE_LABEL[r.stage], value: r.ratePct, valueText: `${r.ratePct}% (${r.exits} of ${r.reached})` }))}
          table={a.byStage.map((r) => [STAGE_LABEL[r.stage], r.exits, r.reached, `${r.ratePct}%`])}
        />
        <ChartCard
          title="Exits by reason and who gave it"
          summary="Colleague-supplied reasons come from the starter. P&P-recorded reasons are entered by the team."
          headers={["Reason", "Colleague-supplied", "P&P-recorded", "Source not recorded", "Total"]}
          items={a.byReason.map((r) => ({ key: r.key, label: reasonLabel(r.key), value: r.total, valueText: `${r.total}`, detail: `Colleague ${r.colleague}, P&P ${r.pnp}${r.unknown ? `, not recorded ${r.unknown}` : ""}` }))}
          table={a.byReason.map((r) => [reasonLabel(r.key), r.colleague, r.pnp, r.unknown, r.total])}
        />
        <ChartCard
          title="Exits by timing"
          summary="How long before the start date the starter left."
          headers={["Timing", "Exits"]}
          items={a.byLeadTime.map((r) => ({ key: r.key, label: r.label, value: r.exits, valueText: `${r.exits}` }))}
          table={a.byLeadTime.map((r) => [r.label, r.exits])}
        />
        <ChartCard
          title="Exit rate by business area"
          headers={["Business area", "Exits", "Starters", "Exit rate"]}
          items={a.byArea.map((r) => ({ key: r.key, label: r.label, value: r.ratePct, valueText: `${r.ratePct}% (${r.exits} of ${r.starters})` }))}
          table={a.byArea.map((r) => [r.label, r.exits, r.starters, `${r.ratePct}%`])}
        />
        <ChartCard
          title="Exit rate by team"
          headers={["Team", "Business area", "Exits", "Starters", "Exit rate"]}
          items={a.byTeam.map((r) => ({ key: r.key, label: r.label, value: r.ratePct, valueText: `${r.ratePct}% (${r.exits} of ${r.starters})`, detail: r.area ?? undefined }))}
          table={a.byTeam.map((r) => [r.label, r.area ?? "None", r.exits, r.starters, `${r.ratePct}%`])}
        />
      </div>

      <h3 id="early-warning" className="mt-6 text-lg font-bold">Early warning ({a.earlyWarning.length})</h3>
      <p className="text-sm text-muted">Active starters showing at least one risk signal. Two or more signals is High; one is Watch.</p>
      <div className="mt-2">
        <ResponsiveTable
          caption="Active starters showing early warning signals"
          rows={a.earlyWarning}
          rowKey={(r) => r.journeyId}
          empty={<p>No active starters are showing risk signals in this view.</p>}
          columns={[
            { key: "name", header: "Starter", primary: true, sort: (r) => r.starterName, cell: (r) => <>{r.starterName}<span className="block text-sm font-normal text-muted">{r.teamName}, LM {r.lmName}</span></> },
            { key: "level", header: "Level", sort: (r) => r.signals.length, cell: (r) => (r.level === "HIGH" ? <Badge tone="danger" icon="alert">High</Badge> : <Badge tone="warning" icon="clock">Watch</Badge>) },
            { key: "signals", header: "Signals", cell: (r) => <ul className="space-y-0.5">{r.signals.map((s) => <li key={s.kind}><span className="font-semibold">{EARLY_SIGNAL_LABEL[s.kind]}:</span> {s.detail}</li>)}</ul> },
            { key: "stage", header: "Stage", sort: (r) => r.stage, cell: (r) => stageLabel(r.stage) },
            { key: "start", header: "Starts", sort: (r) => r.startDate, cell: (r) => <>{fmtDate(r.startDate)}<span className="block text-sm text-muted">{r.daysToStart >= 0 ? `in ${r.daysToStart} d` : `${-r.daysToStart} d ago`}</span></> },
          ]}
        />
        <div className="mt-2">{exportBtn("early-warning", "Export early warning CSV")}</div>
      </div>

      <h3 className="mt-6 text-lg font-bold">Exit report ({exits.rows.length})</h3>
      <div className="mt-2">
        <ResponsiveTable
          caption="Exited starters"
          rows={exits.rows}
          rowKey={(r) => r.journeyId}
          empty={<p>No exits in this view.</p>}
          columns={[
            { key: "name", header: "Starter", primary: true, sort: (r) => r.starterName, cell: (r) => <>{r.starterName}{r.teamName && <span className="block text-sm font-normal text-muted">{r.teamName}</span>}</> },
            { key: "stage", header: "Stage reached", sort: (r) => r.stage ?? "", cell: (r) => stageLabel(r.stage) },
            { key: "reason", header: "Reason", sort: (r) => r.reason ?? "", cell: (r) => reasonLabel(r.reason) },
            { key: "source", header: "Reason from", sort: (r) => r.reasonSource ?? "", cell: (r) => sourceLabel(r.reasonSource) },
            { key: "comment", header: "Comment", cell: (r) => r.comment ?? "None" },
            { key: "date", header: "Exit date", sort: (r) => r.exitedAt ?? "", cell: (r) => fmtDate(r.exitedAt) },
          ]}
        />
      </div>

      <Explain>
        <p><span className="font-semibold">Exit rate:</span> exits divided by starters in this view (every journey since the offer was accepted, whatever its status). The status filter is ignored here because the rate needs every starter.</p>
        <p><span className="font-semibold">By stage:</span> exits at the stage the starter had reached, divided by the starters who reached that stage (from the event log).</p>
        <p><span className="font-semibold">Monthly:</span> exits are counted in the month they happened; offers by the month the offer was accepted. The cohort rate is the share of that month&apos;s offers that have exited so far.</p>
        <p><span className="font-semibold">Reason source:</span> colleague-supplied reasons come from the starter withdrawing in the app; P&P-recorded reasons (failed vetting, offer withdrawn, no show) are entered by the team. Free-text comments are excluded from the CSV unless asked for.</p>
        <p><span className="font-semibold">Timing:</span> days from the exit date to the start date; &quot;after the start date&quot; means they left once they had started.</p>
        <p className="font-semibold">Early warning signals</p>
        <ul className="list-disc pl-5">
          {EARLY_SIGNAL_RULES.map((r) => <li key={r.kind}><span className="font-semibold">{r.label}:</span> {r.text}</li>)}
        </ul>
        <p>Thresholds: vetting action more than {EARLY_WARNING.vettingActionDays} days, quiet starter more than {EARLY_WARNING.starterQuietDays} days, Day 0 within {EARLY_WARNING.day0Days} days of the start.</p>
      </Explain>
    </Section>
  );
}
