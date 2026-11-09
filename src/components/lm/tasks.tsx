"use client";

import { useState } from "react";
import { LINK_TASK_KEYS, linkSchema, MAX_LINKS } from "./schemas";
import { teamChecklistItems } from "./team";
import type { MutateResult } from "./hooks";
import type { StarterDetail, TaskDto } from "./types";
import { Button, Card, ExternalLink, Icon, OverdueBadge, OwnerBadge, StatusBadge, TextField, formatDate } from "./ui";

export interface PanelProps {
  d: StarterDetail;
  base: string;
  mutate: (req: { path: string; method: "POST" | "PUT" | "PATCH"; body: unknown }, optimistic?: (d: StarterDetail) => StarterDetail) => Promise<MutateResult>;
  ok: (text: string) => void;
  fail: (text: string) => void;
}

/** Report a mutate result as a toast. Returns true on success. */
export function report(r: MutateResult, p: Pick<PanelProps, "ok" | "fail">, success: string): boolean {
  if (r.ok) p.ok(success);
  else p.fail(r.message ?? "That didn't work. Please try again.");
  return r.ok;
}

export const linksOf = (t: Pick<TaskDto, "evidence">) => (t.evidence ? t.evidence.split("\n").filter(Boolean) : []);

/** Optimistic patch of one task, adjusting the headline progress numbers. */
export function patchTask(d: StarterDetail, key: string, fn: (t: TaskDto) => TaskDto): StarterDetail {
  const tasks = d.tasks.map((t) => (t.key === key ? fn(t) : t));
  const done = tasks.filter((t) => t.status === "DONE").length;
  return {
    ...d,
    tasks,
    progress: {
      ...d.progress,
      done,
      percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
      overdue: tasks.filter((t) => t.overdue).length,
    },
  };
}

export const markDone = (d: StarterDetail, key: string) =>
  patchTask(d, key, (t) => ({ ...t, status: "DONE", completedAt: new Date().toISOString(), overdue: false, blockedReason: null }));
export const reopen = (d: StarterDetail, key: string) =>
  patchTask(d, key, (t) => ({ ...t, status: "TODO", completedAt: null, overdue: new Date(t.dueDate) < new Date() }));

/** IT request tasks are LM-owned and the buddy may also complete them (F10). */
const isItRequest = (key: string) => key.includes("it-request");

/** One task. LM-owned tasks are highlighted and actionable; everything else is read-only. */
export function TaskRow({ t, p }: { t: TaskDto; p: PanelProps }) {
  const mine = t.owner === "LM";
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const done = t.status === "DONE";
    const r = await p.mutate(
      { path: `${p.base}/tasks/${t.key}`, method: "PATCH", body: { status: done ? "TODO" : "DONE" } },
      (d) => (done ? reopen(d, t.key) : markDone(d, t.key)),
    );
    setBusy(false);
    report(r, p, done ? `Reopened "${t.title}"` : `Marked "${t.title}" done`);
  }

  return (
    <Card highlight={mine} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-base font-semibold">{t.title}</h3>
        <StatusBadge status={t.status} />
        {t.overdue && <OverdueBadge label={mine ? "Overdue: P&P may chase" : "Overdue"} />}
        <OwnerBadge owner={t.owner} />
      </div>
      {t.description && <p className="text-muted">{t.description}</p>}
      <p className="text-sm text-muted">
        Due {formatDate(t.dueDate)}
        {t.completedAt && ` · Done ${formatDate(t.completedAt)}`}
        {t.source === "BESPOKE" && " · Added by you"}
      </p>
      {t.status === "BLOCKED" && t.blockedReason && <p className="text-sm font-semibold text-blocked">Blocked: {t.blockedReason}</p>}
      {t.status === "LOCKED" && t.waitingFor.length > 0 && <p className="text-sm text-muted">Waiting for: {t.waitingFor.join(", ")}</p>}
      {t.canAct && (
        <Button variant={t.status === "DONE" ? "ghost" : "primary"} busy={busy} disabled={busy} onClick={toggle} aria-label={`${t.status === "DONE" ? "Reopen" : "Mark done"}: ${t.title}`}>
          <Icon name="check" />
          {t.status === "DONE" ? "Reopen" : "Mark done"}
        </Button>
      )}
      {mine && isItRequest(t.key) && t.status !== "DONE" && <p className="text-sm text-muted">Your buddy can also do this.</p>}
      {mine && t.status === "LOCKED" && <p className="text-sm text-muted">You can act on this once the task it is waiting for is done.</p>}
    </Card>
  );
}

/** FR-3.13: Teams links for recurring team calls. Stored as references only (task evidence). */
function LinksEditor({ t, p }: { t: TaskDto; p: PanelProps }) {
  const links = linksOf(t);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const canEdit = t.owner === "LM" && t.status !== "LOCKED" && p.d.journey.status === "active";

  async function save(next: string[], success: string) {
    const r = await p.mutate(
      { path: `${p.base}/tasks/${t.key}`, method: "PATCH", body: { links: next } },
      (d) => patchTask(d, t.key, (x) => ({ ...x, evidence: next.join("\n") || null })),
    );
    return report(r, p, success);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const v = linkSchema.safeParse(draft);
    if (!v.success) return setError(v.error.issues[0].message);
    if (links.length >= MAX_LINKS) return setError(`Add at most ${MAX_LINKS} links`);
    if (links.includes(v.data)) return setError("That link is already on the list");
    setError(undefined);
    if (await save([...links, v.data], "Link added")) setDraft("");
  }

  return (
    <div className="mt-2 space-y-2 border-t border-line pt-3">
      <p className="font-semibold">Teams links for recurring calls (optional)</p>
      {links.length === 0 && <p className="text-sm text-muted">No links added yet.</p>}
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l} className="flex items-center gap-2">
            <ExternalLink href={l} className="min-w-0 flex-1 justify-start truncate">
              <Icon name="link" />
              <span className="truncate">{l.replace(/^https:\/\//, "")}</span>
            </ExternalLink>
            {canEdit && (
              <Button variant="ghost" aria-label={`Remove link ${l}`} onClick={() => save(links.filter((x) => x !== l), "Link removed")} className="min-w-11 px-2">
                <Icon name="x" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form onSubmit={add} noValidate className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex-1">
            <TextField label="Add a Teams link" type="url" inputMode="url" placeholder="https://teams.microsoft.com/..." value={draft} onChange={(e) => setDraft(e.target.value)} error={error} />
          </div>
          <Button type="submit" variant="secondary" className="sm:mt-7">
            <Icon name="plus" /> Add link
          </Button>
        </form>
      )}
    </div>
  );
}

/** FR-3.5 / FR-3.13: TEAM-source tasks (plus the recurring calls task) as one checklist. */
export function TeamChecklist({ p, onAdd }: { p: PanelProps; onAdd: () => void }) {
  const items = teamChecklistItems(p.d.tasks) as TaskDto[];
  const active = p.d.journey.status === "active";
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const done = items.filter((t) => t.status === "DONE").length;
  if (items.length === 0) {
    if (!active) return null;
    return (
      <Button variant="secondary" onClick={onAdd}>
        <Icon name="plus" /> Add team checklist item
      </Button>
    );
  }

  async function toggle(t: TaskDto) {
    setBusyKey(t.key);
    const isDone = t.status === "DONE";
    const r = await p.mutate(
      { path: `${p.base}/tasks/${t.key}`, method: "PATCH", body: { status: isDone ? "TODO" : "DONE" } },
      (d) => (isDone ? reopen(d, t.key) : markDone(d, t.key)),
    );
    setBusyKey(null);
    report(r, p, isDone ? `Reopened "${t.title}"` : `Ticked off "${t.title}"`);
  }

  return (
    <section aria-labelledby="team-checklist" className="space-y-3">
      <h2 id="team-checklist" className="text-xl font-bold text-ink">
        Team checklist <span className="text-base font-normal text-muted">({done} of {items.length} done)</span>
      </h2>
      {active && (
        <Button variant="secondary" onClick={onAdd}>
          <Icon name="plus" /> Add team checklist item
        </Button>
      )}
      <ul className="space-y-3">
        {items.map((t) => {
          const editable = t.canAct;
          const id = `chk-${t.key}`;
          return (
            <li key={t.key}>
              <Card highlight={t.owner === "LM"}>
                <div className="flex items-start gap-3">
                  <input
                    id={id}
                    type="checkbox"
                    checked={t.status === "DONE"}
                    disabled={!editable || busyKey === t.key}
                    onChange={() => toggle(t)}
                    className="mt-1 size-6 shrink-0 accent-brand"
                  />
                  <div className="flex-1 space-y-1">
                    <label htmlFor={id} className="block min-h-8 font-semibold">
                      {t.title}
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={t.status} />
                      {t.overdue && <OverdueBadge label="Overdue: P&P may chase" />}
                      <span className="text-sm text-muted">Due {formatDate(t.dueDate)}</span>
                    </div>
                    {t.description && <p className="text-sm text-muted">{t.description}</p>}
                    {!editable && t.status === "LOCKED" && t.waitingFor.length > 0 && (
                      <p className="text-sm text-muted">Waiting for: {t.waitingFor.join(", ")}</p>
                    )}
                  </div>
                </div>
                {LINK_TASK_KEYS.includes(t.key) && <LinksEditor t={t} p={p} />}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
