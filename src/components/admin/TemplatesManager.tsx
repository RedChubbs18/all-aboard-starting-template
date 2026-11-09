"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/auth/use-api";
import { ADAPTER_KEYS, OWNERS, STAGES, TASK_TYPES } from "@/domain/types";
import { Alert, Confirm, Drawer, Field, btnCls, inputCls, useNotice, useSend, type Fields } from "./common";

export interface TemplateRow {
  id: string;
  key: string;
  title: string;
  description: string;
  stage: string;
  owner: string;
  type: string;
  dueOffsetDays: number;
  dependsOn: string[];
  source: string;
  teamId: string | null;
  adapterKey: string | null;
  gating: boolean;
  optional: boolean;
  autoCompleteOnOpen: boolean;
  contentSlug: string | null;
  condition: string | null;
  sortOrder: number;
  active: boolean;
}
interface Team {
  id: string;
  name: string;
}

const STAGE_LABEL: Record<string, string> = {
  CONDITIONAL_OFFER: "1. Conditional offer",
  PEV: "2. Pre-employment vetting",
  UNCONDITIONAL_OFFER: "3. Unconditional offer",
  DAY_0: "4. Day 0",
  DAY_30: "5. Day 30",
};
const CONDITIONS = ["induction-not-booked", "pev-steps-incomplete", "photo-check-failed"];

const blank = (): TemplateRow => ({
  id: "", key: "", title: "", description: "", stage: "PEV", owner: "STARTER", type: "ACTION", dueOffsetDays: 0,
  dependsOn: [], source: "CORE", teamId: null, adapterKey: null, gating: false, optional: false, autoCompleteOnOpen: false, contentSlug: null, condition: null, sortOrder: 0, active: true,
});

/** FR-AD.1. `readOnly` is for P&P (they may view templates but not change them). */
export function TemplatesManager({ readOnly = false }: { readOnly?: boolean }) {
  const tpl = useApi<TemplateRow[]>("/api/admin/templates");
  const teams = useApi<Team[]>("/api/admin/teams");
  const content = useApi<{ slug: string; title: string }[]>(readOnly ? null : "/api/admin/content");
  const send = useSend();
  const n = useNotice();
  const [filter, setFilter] = useState("ALL");
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [errors, setErrors] = useState<Fields>({});
  const [formMsg, setFormMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<TemplateRow | null>(null);

  const rows = useMemo(() => (tpl.data ?? []).filter((t) => filter === "ALL" || (filter === "CORE" ? t.source === "CORE" : t.teamId === filter)), [tpl.data, filter]);
  const teamName = (id: string | null) => teams.data?.find((t) => t.id === id)?.name ?? id;

  const open = (t: TemplateRow, create: boolean) => {
    setEditing(t);
    setIsNew(create);
    setErrors({});
    setFormMsg("");
  };
  const set = <K extends keyof TemplateRow>(k: K, v: TemplateRow[K]) => setEditing((e) => (e ? { ...e, [k]: v } : e));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    const { id, ...body } = editing;
    void id;
    const r = await send(isNew ? "POST" : "PUT", isNew ? "/api/admin/templates" : `/api/admin/templates/${editing.id}`, body);
    setBusy(false);
    if (r.ok) {
      n.success(`Template "${editing.title}" saved. It applies to new journeys only.`);
      setEditing(null);
      tpl.reload();
    } else {
      setErrors(r.fields);
      setFormMsg(r.message);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    const r = await send("DELETE", `/api/admin/templates/${deleting.id}`);
    setBusy(false);
    if (r.ok) {
      n.success(`Template "${deleting.title}" deleted.`);
      tpl.reload();
    } else n.fail(r.message);
    setDeleting(null);
  }

  return (
    <div className="space-y-4">
      <Alert kind="info">Edits to templates affect new journeys only. Journeys already in flight keep the tasks they were created with.</Alert>
      {readOnly && <Alert kind="warning">Read-only view. Only administrators can change templates.</Alert>}
      {n.notice}
      {tpl.error && <Alert kind="danger">{tpl.error}</Alert>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Show templates">
          {(p) => (
            <select {...p} className={inputCls} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="ALL">All templates</option>
              <option value="CORE">Core only</option>
              {(teams.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  Team: {t.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        {!readOnly && (
          <button type="button" className={btnCls.primary} onClick={() => open(blank(), true)}>
            New template
          </button>
        )}
      </div>
      {tpl.loading && <p role="status" className="text-muted">Loading templates…</p>}
      {STAGES.map((stage) => {
        const inStage = rows.filter((t) => t.stage === stage).sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <section key={stage} aria-labelledby={`h-${stage}`} className="rounded-lg bg-card p-4 border border-line">
            <h2 id={`h-${stage}`} className="text-lg font-bold">
              {STAGE_LABEL[stage]} <span className="text-muted">({inStage.length})</span>
            </h2>
            {inStage.length === 0 && <p className="mt-2 text-muted">No templates for this stage.</p>}
            <ul className="mt-2 divide-y divide-line">
              {inStage.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t.title} {!t.active && <span className="text-muted">(inactive)</span>}
                    </p>
                    <p className="text-sm text-muted">
                      {t.type} | owner {t.owner} | due {t.dueOffsetDays > 0 ? "+" : ""}{t.dueOffsetDays}d | {t.source === "TEAM" ? `TEAM: ${teamName(t.teamId)}` : t.source}
                      {t.gating && " | gating"}
                    </p>
                    <p className="text-sm text-muted">
                      key {t.key}
                      {t.dependsOn.length > 0 && ` | depends on: ${t.dependsOn.join(", ")}`}
                      {t.condition && ` | only if ${t.condition}`}
                    </p>
                  </div>
                  {!readOnly && (
                    <div className="flex gap-2">
                      <button type="button" className={btnCls.secondary} onClick={() => open(t, false)} aria-label={`Edit ${t.title}`}>
                        Edit
                      </button>
                      <button type="button" className={btnCls.secondary} onClick={() => setDeleting(t)} aria-label={`Delete ${t.title}`}>
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <Drawer title={isNew ? "New template" : "Edit template"} open={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={save} className="space-y-3" noValidate>
            {formMsg && !Object.keys(errors).length && <Alert kind="danger">{formMsg}</Alert>}
            <Field label="Key" error={errors.key} hint={isNew ? "Lowercase letters, numbers and hyphens. Cannot be changed later." : "Keys cannot be changed."}>
              {(p) => <input {...p} className={inputCls} value={editing.key} readOnly={!isNew} onChange={(e) => set("key", e.target.value)} />}
            </Field>
            <Field label="Title" error={errors.title}>
              {(p) => <input {...p} className={inputCls} value={editing.title} onChange={(e) => set("title", e.target.value)} />}
            </Field>
            <Field label="Description" error={errors.description}>
              {(p) => <textarea {...p} rows={3} className={inputCls} value={editing.description} onChange={(e) => set("description", e.target.value)} />}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stage" error={errors.stage}>
                {(p) => (
                  <select {...p} className={inputCls} value={editing.stage} onChange={(e) => set("stage", e.target.value)}>
                    {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Owner" error={errors.owner}>
                {(p) => (
                  <select {...p} className={inputCls} value={editing.owner} onChange={(e) => set("owner", e.target.value)}>
                    {OWNERS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Type" error={errors.type}>
                {(p) => (
                  <select {...p} className={inputCls} value={editing.type} onChange={(e) => set("type", e.target.value)}>
                    {TASK_TYPES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Due offset (days)" error={errors.dueOffsetDays} hint="Relative to start date. Negative is before.">
                {(p) => <input {...p} type="number" step={1} className={inputCls} value={editing.dueOffsetDays} onChange={(e) => set("dueOffsetDays", e.target.value === "" ? 0 : Number(e.target.value))} />}
              </Field>
              <Field label="Source" error={errors.source}>
                {(p) => (
                  <select {...p} className={inputCls} value={editing.source} onChange={(e) => { set("source", e.target.value); if (e.target.value === "CORE") set("teamId", null); }}>
                    <option value="CORE">Core (all teams)</option>
                    <option value="TEAM">Team specific</option>
                  </select>
                )}
              </Field>
              {editing.source === "TEAM" && (
                <Field label="Team" error={errors.teamId}>
                  {(p) => (
                    <select {...p} className={inputCls} value={editing.teamId ?? ""} onChange={(e) => set("teamId", e.target.value || null)}>
                      <option value="">Choose a team</option>
                      {(teams.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                </Field>
              )}
            </div>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-6" checked={editing.gating} onChange={(e) => set("gating", e.target.checked)} />
              Gating (must be done before the next stage opens)
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-6" checked={editing.optional} onChange={(e) => { set("optional", e.target.checked); if (e.target.checked) set("gating", false); }} />
              Optional (never gating, not counted in progress)
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-6" checked={editing.autoCompleteOnOpen} onChange={(e) => set("autoCompleteOnOpen", e.target.checked)} />
              Complete when the colleague opens it (read-only information tasks)
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-6" checked={editing.active} onChange={(e) => set("active", e.target.checked)} />
              Active (used for new journeys)
            </label>
            <Field label="Content slug" error={errors.contentSlug} hint="Optional content item shown with the task.">
              {(p) => (
                <select {...p} className={inputCls} value={editing.contentSlug ?? ""} onChange={(e) => set("contentSlug", e.target.value || null)}>
                  <option value="">None</option>
                  {(content.data ?? []).map((c) => <option key={c.slug} value={c.slug}>{c.title} ({c.slug})</option>)}
                </select>
              )}
            </Field>
            <Field label="Adapter" error={errors.adapterKey} hint="Integration that completes or feeds this task.">
              {(p) => (
                <select {...p} className={inputCls} value={editing.adapterKey ?? ""} onChange={(e) => set("adapterKey", e.target.value || null)}>
                  <option value="">None</option>
                  {ADAPTER_KEYS.map((k) => <option key={k}>{k}</option>)}
                </select>
              )}
            </Field>
            <Field label="Condition" error={errors.condition} hint="Task only applies when true. Named condition, done:KEY or notDone:KEY.">
              {(p) => (
                <>
                  <input {...p} list="conditions" className={inputCls} value={editing.condition ?? ""} onChange={(e) => set("condition", e.target.value || null)} />
                  <datalist id="conditions">
                    {CONDITIONS.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </>
              )}
            </Field>
            <fieldset aria-describedby="deps-err" className="rounded-md border-2 border-line p-3">
              <legend className="px-1 font-medium">Depends on</legend>
              <div className="max-h-48 overflow-y-auto">
                {(tpl.data ?? []).filter((t) => t.key !== editing.key).map((t) => (
                  <label key={t.key} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-6"
                      checked={editing.dependsOn.includes(t.key)}
                      onChange={(e) => set("dependsOn", e.target.checked ? [...editing.dependsOn, t.key] : editing.dependsOn.filter((k) => k !== t.key))}
                    />
                    <span>{t.title} <span className="text-sm text-muted">({t.key})</span></span>
                  </label>
                ))}
              </div>
              {errors.dependsOn && <p id="deps-err" className="mt-1 text-sm font-medium text-blocked">Error: {errors.dependsOn}</p>}
            </fieldset>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnCls.secondary} onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className={btnCls.primary} disabled={busy} aria-busy={busy}>Save template</button>
            </div>
          </form>
        )}
      </Drawer>
      <Confirm
        open={!!deleting}
        title="Delete template?"
        message={<>Delete &quot;{deleting?.title}&quot;. New journeys will no longer get this task. Existing journeys are not changed.</>}
        confirmLabel="Delete"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </div>
  );
}
