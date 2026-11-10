"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth/client";
import { useApi } from "@/lib/auth/use-api";
import type { Issue, Overview } from "@/server/mi-service";
import type { LmLeagueRow } from "@/server/mi-metrics";
import { FilterBar } from "./FilterBar";
import { filtersToQuery, parseFilters, type MiFilters } from "./filters";
import { ISSUE_KIND_LABEL, OWNER_LABEL, STAGE_LABEL, STATUS_LABEL, stageLabel } from "./labels";
import { AttritionSection } from "./AttritionSection";
import { Explain } from "./Explain";
import { FlowSection } from "./FlowSection";
import { fmtDate, plural } from "./format";
import { IntakeSection } from "./IntakeSection";
import { LmSection } from "./LmSection";
import { ChipRow, chipClass as chipLinkClass } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Badge, Icon, Modal, ResponsiveTable, Section, Skeleton, btnPrimary, btnSecondary, fieldClass } from "./primitives";

type Notice = { kind: "success" | "error"; text: string } | null;

export function MiDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { apiFetch } = useSession();
  const filters = useMemo(() => parseFilters(new URLSearchParams(sp.toString())), [sp]);
  const query = filtersToQuery(filters);
  const { data, error, loading, reload } = useApi<Overview>(`/api/mi/overview${query ? `?${query}` : ""}`);
  const [notice, setNotice] = useState<Notice>(null);
  // Keep the previous result on screen while a new filter set loads, so the filter bar keeps focus.
  const [stale, setStale] = useState<Overview | null>(null);
  if (data && data !== stale) setStale(data);
  const view = data ?? stale;

  useEffect(() => {
    if (notice?.kind !== "success") return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const onFilters = useCallback((next: MiFilters) => {
    const q = filtersToQuery(next);
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [router, pathname]);

  const post = useCallback(async (path: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> => {
    const r = await apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  }, [apiFetch]);

  const download = useCallback(async (type: string) => {
    const r = await apiFetch(`/api/mi/export?type=${type}${query ? `&${query}` : ""}`);
    if (!r.ok) return setNotice({ kind: "error", text: "Export failed. Try again." });
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `mi-${type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice({ kind: "success", text: "Export downloaded" });
  }, [apiFetch, query]);

  const exportBtn = (type: string, label: string) => (
    <button type="button" onClick={() => download(type)} className={`${btnSecondary} !px-3 text-sm`}>
      <Icon name="download" /> {label}
    </button>
  );

  const toast = (n: NonNullable<typeof notice>) => (
    <div className={`flex items-start gap-2 rounded-md p-3 text-card border border-line ${n.kind === "error" ? "bg-blocked" : "bg-dark-green"}`}>
      <Icon name={n.kind === "error" ? "alert" : "check"} />
      <p className="flex-1">{n.text}</p>
      <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md">
        <Icon name="x" />
      </button>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 pb-20 md:pb-4">
      <h1 className="text-[1.75rem] font-bold leading-tight text-ink">MI: onboarding insight</h1>

      {/* Two always-mounted live regions (polite and assertive) so announcements are reliable; the role never swaps. */}
      <div className="pointer-events-none fixed inset-x-3 top-3 z-50 md:inset-x-auto md:right-4 md:top-auto md:bottom-4 md:w-96">
        <div role="status" className="pointer-events-auto">
          {notice && notice.kind !== "error" && toast(notice)}
        </div>
        <div role="alert" className="pointer-events-auto">
          {notice?.kind === "error" && toast(notice)}
        </div>
      </div>

      {view && <FilterBar filters={filters} options={view.options} onChange={onFilters} />}

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border-l-4 border-blocked bg-blocked-tint p-3 text-blocked">
          <Icon name="alert" />
          <p className="flex-1 font-semibold">{error}</p>
          <button type="button" onClick={reload} className={btnSecondary}>Retry</button>
        </div>
      )}

      {loading && !view && (
        <div aria-busy="true" role="status" className="space-y-4">
          <span className="sr-only">Loading MI</span>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>
          <Skeleton className="h-64" />
        </div>
      )}

      {view && <div aria-busy={loading}><Body data={view} onClear={() => onFilters({})} post={post} reload={reload} setNotice={setNotice} exportBtn={exportBtn} /></div>}
    </div>
  );
}

function Body({ data, onClear, post, reload, setNotice, exportBtn }: {
  data: Overview;
  onClear: () => void;
  post: (path: string, body: unknown) => Promise<{ ok: boolean; json: Record<string, unknown> }>;
  reload: () => void;
  setNotice: (n: Notice) => void;
  exportBtn: (type: string, label: string) => React.ReactNode;
}) {
  const total = data.journeys.length;
  const kpis: { label: string; value: number }[] = [
    { label: "Active", value: data.kpis.active },
    { label: "Starting in next 13 weeks", value: data.kpis.startingSoon },
    { label: "Overdue LM actions", value: data.kpis.overdueLmActions },
    { label: "Major flags", value: data.kpis.majorFlags },
    { label: "Blocked journeys", value: data.kpis.flagged },
    { label: "Exited", value: data.kpis.exited },
    { label: "Completed", value: data.kpis.completed },
  ];
  const [chasing, setChasing] = useState<LmLeagueRow | null>(null);
  const [support, setSupport] = useState<Issue | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const empty = (
    <div className="py-6 text-center">
      <p className="font-semibold">No starters match these filters</p>
      <p className="mt-1 text-muted">Clear the filters to see everyone again.</p>
      <button type="button" onClick={onClear} className={`${btnPrimary} mt-3`}>Clear filters</button>
    </div>
  );

  async function doChase() {
    if (!chasing) return;
    setBusy(true);
    const r = await post("/api/mi/chase", { lmId: chasing.lmId });
    setBusy(false);
    if (r.ok) setNotice({ kind: "success", text: `Nudge sent to ${chasing.lmName}` });
    else setNotice({ kind: "error", text: String(r.json.message ?? "Could not send the nudge") });
    setChasing(null);
    reload();
  }

  async function doSupport() {
    if (!support) return;
    setBusy(true);
    const r = await post("/api/mi/support", { journeyId: support.journeyId, taskKey: support.taskKey, note });
    setBusy(false);
    if (r.ok) setNotice({ kind: "success", text: `Support raised with ${String(r.json.routedTo)}` });
    else setNotice({ kind: "error", text: String(r.json.message ?? "Could not raise support") });
    setSupport(null);
    setNote("");
  }

  return (
    <>
      <section aria-label="Key figures">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
          {kpis.map((k) => (
            <li key={k.label} className="rounded-md border border-line bg-card px-[22px] py-4">
              <p className="text-[2rem] font-extrabold leading-tight tracking-[-0.02em] text-ink">{k.value}</p>
              <p className="text-sm text-muted">{k.label}</p>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted">Key figures and the sections down to the intake outlook ignore the status filter, so every rate has a full denominator.</p>
      </section>

      <nav aria-label="Dashboard sections">
        <ChipRow label="Jump to section">
          {[["#lm", "Line managers"], ["#attrition", "Attrition"], ["#flow", "Flow"], ["#intake", "Intake"], ["#issues", "Issues"], ["#starters", "Starters"]].map(([href, label]) => (
            <a key={href} href={href} className={chipLinkClass}>{label}</a>
          ))}
        </ChipRow>
      </nav>

      <LmSection lm={data.lm} exportBtn={exportBtn} onChase={setChasing} />
      <AttritionSection attrition={data.attrition} exits={data.exits} exportBtn={exportBtn} />
      <FlowSection data={data} exportBtn={exportBtn} empty={empty} />
      <IntakeSection intake={data.intake} exportBtn={exportBtn} />

      <Section id="issues" title={`Issues (${data.issues.length})`} actions={exportBtn("issues", "Export issues CSV")}>
        <p className="text-sm text-muted">Blocked, overdue and failed steps across active journeys.</p>
        <div className="mt-3">
          <ResponsiveTable
            caption="Issues across active journeys"
            rows={data.issues}
            rowKey={(r) => `${r.journeyId}|${r.taskKey}`}
            empty={<p>No issues. Nothing is blocked, overdue or failed in this view.</p>}
            columns={[
              { key: "starter", header: "Starter", primary: true, sort: (r) => r.starterName, cell: (r) => r.starterName },
              { key: "task", header: "Step", sort: (r) => r.title, cell: (r) => <>{r.title}<span className="block text-sm text-muted">{stageLabel(r.stage)}</span></> },
              { key: "kind", header: "Issue", sort: (r) => r.kind, cell: (r) => <Badge tone={r.kind === "OVERDUE" ? "warning" : "danger"} icon={r.kind === "OVERDUE" ? "clock" : "alert"}>{ISSUE_KIND_LABEL[r.kind]}</Badge> },
              { key: "days", header: "Days overdue", sort: (r) => r.daysOverdue, cell: (r) => (r.daysOverdue ? `${r.daysOverdue} d` : "Not overdue") },
              { key: "owner", header: "Owner", sort: (r) => r.owner, cell: (r) => <>{OWNER_LABEL[r.owner] ?? r.owner}{r.owner === "LM" && <span className="block text-sm text-muted">{r.lmName}</span>}</> },
              { key: "act", header: "Action", cell: (r) => <button type="button" onClick={() => { setNote(""); setSupport(r); }} className={`${btnSecondary} !px-3 text-sm`}>Raise support<span className="sr-only"> for {r.starterName}: {r.title}</span></button> },
            ]}
          />
        </div>
        <Explain>
          <p>Failed and action-needed integration steps first, then blocked, then overdue (D3: not done, not locked, due date passed). Raise support routes to the line manager, the P&amp;P queue or the owning system team. This list follows the status filter.</p>
        </Explain>
      </Section>

      <Section id="starters" title={`Starters (${total})`} actions={exportBtn("journeys", "Export starters CSV")}>
        <ResponsiveTable
          caption="Starters"
          rows={data.journeys}
          rowKey={(r) => r.id}
          empty={empty}
          columns={[
            { key: "name", header: "Starter", primary: true, sort: (r) => r.starterName, cell: (r) => <>{r.starterName}<span className="block text-sm font-normal text-muted">{r.workEmail}</span></> },
            { key: "stage", header: "Stage", sort: (r) => r.stage, cell: (r) => STAGE_LABEL[r.stage] },
            { key: "status", header: "Status", sort: (r) => r.status, cell: (r) => <>{STATUS_LABEL[r.status] ?? r.status}{r.flagged && <> <Badge tone="danger" icon="alert">Flagged</Badge></>}</> },
            { key: "start", header: "Start date", sort: (r) => r.startDate, cell: (r) => fmtDate(r.startDate) },
            { key: "team", header: "Team", sort: (r) => r.teamName, cell: (r) => <>{r.teamName}{r.area && <span className="block text-sm text-muted">{r.area}</span>}</> },
            { key: "lm", header: "Line manager", sort: (r) => r.lmName, cell: (r) => r.lmName },
            { key: "tasks", header: "Tasks done", sort: (r) => (r.totalTasks ? r.doneTasks / r.totalTasks : 0), cell: (r) => `${r.doneTasks} of ${r.totalTasks}` },
          ]}
        />
      </Section>

      <Modal open={!!chasing} onClose={() => setChasing(null)} title="Chase line manager">
        {chasing && (
          <>
            <p>Send a nudge to {chasing.lmName} about {plural(chasing.overdueItems.length, "overdue action")}?</p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {chasing.overdueItems.map((t) => <li key={`${t.journeyId}|${t.taskKey}`}>{t.title} for {t.starterName}, {t.days} d overdue</li>)}
            </ul>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => setChasing(null)} className={btnSecondary}>Cancel</button>
              <Button onClick={doChase} aria-disabled={busy || undefined} busy={busy}>{busy ? "Sending..." : "Send nudge"}</Button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!support} onClose={() => setSupport(null)} title="Raise support">
        {support && (
          <form onSubmit={(e) => { e.preventDefault(); void doSupport(); }}>
            <p className="text-sm text-muted">{support.starterName}: {support.title}</p>
            <p className="mt-2"><span className="font-semibold">Routes to:</span> {support.routeLabel}</p>
            <label htmlFor="mi-support-note" className="mt-3 block text-sm font-semibold">Note (optional, do not include personal details)</label>
            <textarea id="mi-support-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={4} className={`${fieldClass} py-2`} />
            <p className="text-right text-sm text-muted">{note.length} of 500</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={() => setSupport(null)} className={btnSecondary}>Cancel</button>
              <Button type="submit" aria-disabled={busy || undefined} busy={busy}>{busy ? "Submitting..." : "Submit"}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
