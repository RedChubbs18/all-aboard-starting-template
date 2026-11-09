"use client";

import { Pencil } from "lucide-react";
import { useId, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/lib/auth/client";
import type { GoalHorizon } from "@/domain/types";

export interface GoalItem {
  id: string;
  horizon: GoalHorizon;
  text: string;
  done: boolean;
}

interface Props {
  journeyId: string;
  goals: GoalItem[];
  canEdit: boolean;
  onChanged: () => void | Promise<void>;
}

const HORIZONS: { key: "30" | "60" | "90"; label: string }[] = [
  { key: "30", label: "First 30 days" },
  { key: "60", label: "By 60 days" },
  { key: "90", label: "By 90 days" },
];

function AddGoal({ horizon, journeyId, onAdded }: { horizon: "30" | "60" | "90"; journeyId: string; onAdded: () => void | Promise<void> }) {
  const { apiFetch } = useSession();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const r = await apiFetch("/api/starter/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ journeyId, horizon, text }),
    });
    setBusy(false);
    if (r.ok) {
      setText("");
      toast.success("Goal added");
      await onAdded();
    } else toast.error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? "Couldn't add that goal");
  }
  return (
    <form onSubmit={add} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor={id} className="text-sm font-semibold">
          Add a goal
        </label>
        <input
          id={id}
          value={text}
          maxLength={280}
          onChange={(e) => setText(e.target.value)}
          className="min-h-12 w-full rounded-md border-2 border-border bg-surface px-3 text-base focus-visible:border-info"
        />
      </div>
      <Button type="submit" loading={busy} aria-disabled={!text.trim()}>
        Add
      </Button>
    </form>
  );
}

function GoalRow({ goal, canEdit, onChanged }: { goal: GoalItem; canEdit: boolean; onChanged: () => void | Promise<void> }) {
  const { apiFetch } = useSession();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(goal.text);
  const [done, setDone] = useState(goal.done);
  const patch = async (body: { text?: string; done?: boolean }) => {
    const r = await apiFetch(`/api/starter/goals/${goal.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) {
      toast.error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? "Couldn't save that");
      return false;
    }
    await onChanged();
    return true;
  };
  return (
    <li className="flex items-start gap-3 rounded-md border border-border/40 bg-surface p-3">
      <input
        type="checkbox"
        className="mt-1 size-6 shrink-0 accent-[var(--color-brand)]"
        checked={done}
        disabled={!canEdit}
        aria-label={`Done: ${goal.text}`}
        onChange={async (e) => {
          const next = e.target.checked;
          setDone(next);
          if (!(await patch({ done: next }))) setDone(!next);
        }}
      />
      {editing ? (
        <form
          className="flex flex-1 flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (text.trim() && (await patch({ text }))) setEditing(false);
          }}
        >
          <input value={text} maxLength={280} onChange={(e) => setText(e.target.value)} aria-label="Goal text" className="min-h-11 flex-1 rounded-md border-2 border-border px-3" />
          <Button type="submit">Save</Button>
          <Button variant="ghost" onClick={() => { setText(goal.text); setEditing(false); }}>
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <span className={done ? "flex-1 text-text-muted line-through" : "flex-1"}>{goal.text}</span>
          {canEdit && (
            <Button variant="ghost" size="icon" aria-label={`Edit goal: ${goal.text}`} onClick={() => setEditing(true)}>
              <Pencil aria-hidden className="size-5" />
            </Button>
          )}
        </>
      )}
    </li>
  );
}

/** FR-4.9 30-60-90 goals (starter can add, edit and tick) and FR-5.1 cascaded goals (read-only). */
export function GoalsPanel({ journeyId, goals, canEdit, onChanged }: Props) {
  const cascaded = goals.filter((g) => g.horizon === "CASCADED");
  return (
    <div className="space-y-4">
      {!canEdit && (
        <Alert tone="info">
          <p>These goals are read-only for you.</p>
        </Alert>
      )}
      {HORIZONS.map((h) => {
        const list = goals.filter((g) => g.horizon === h.key);
        return (
          <Card as="section" key={h.key} aria-labelledby={`goals-${h.key}`}>
            <h2 id={`goals-${h.key}`} className="text-lg font-semibold">
              {h.label}
            </h2>
            {list.length === 0 ? (
              <p className="mt-2 text-text-muted">No goals yet. Agree a few with your line manager.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {list.map((g) => (
                  <GoalRow key={`${g.id}:${g.text}:${g.done}`} goal={g} canEdit={canEdit} onChanged={onChanged} />
                ))}
              </ul>
            )}
            {canEdit && <AddGoal horizon={h.key} journeyId={journeyId} onAdded={onChanged} />}
          </Card>
        );
      })}
      <Card as="section" aria-labelledby="goals-cascaded">
        <h2 id="goals-cascaded" className="text-lg font-semibold">
          Goals from your line manager
        </h2>
        {cascaded.length === 0 ? (
          <p className="mt-2 text-text-muted">Your line manager hasn&apos;t shared any cascaded goals yet. They will appear here by Day 30.</p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {cascaded.map((g) => (
              <li key={g.id}>{g.text}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-text-muted">These are set by your line manager and can&apos;t be edited here.</p>
      </Card>
    </div>
  );
}
