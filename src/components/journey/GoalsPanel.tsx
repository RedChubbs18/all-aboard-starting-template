"use client";

import { controlClass } from "@/components/ui/Field";
import { Lock, Pencil } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useFocusSwap } from "@/components/ui/use-focus-swap";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Card } from "@/components/ui/Card";
import { ErrorSummary } from "@/components/lm/error-summary";
import { useToast } from "@/components/ui/Toast";
import { formatLongDate } from "./format";
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
  /** D21 / F8: ISO start date while the starter's goals are locked (read-only with lock icons). */
  lockedUntil?: string | null;
  onChanged: () => void | Promise<void>;
}

const HORIZONS: { key: "30" | "60" | "90"; label: string }[] = [
  { key: "30", label: "First 30 days" },
  { key: "60", label: "By 60 days" },
  { key: "90", label: "By 90 days" },
];

function AddGoal({ horizon, label, journeyId, onAdded }: { horizon: "30" | "60" | "90"; label: string; journeyId: string; onAdded: () => void | Promise<void> }) {
  const { apiFetch } = useSession();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const id = useId();
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError("Enter a goal before adding it.");
      setAttempt((n) => n + 1);
      return;
    }
    setError(null);
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
    } else {
      const message = ((await r.json().catch(() => ({}))) as { message?: string }).message ?? "Couldn't add that goal";
      setError(message);
      setAttempt((n) => n + 1);
      toast.error(message);
    }
  }
  return (
    <form onSubmit={add} noValidate className="mt-3 space-y-2">
      <ErrorSummary message={error} title="Couldn't add that goal" focusKey={attempt} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor={id} className="text-sm font-semibold">
          Add a goal for {label.toLowerCase()}
        </label>
        <input
          id={id}
          value={text}
          maxLength={280}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={error ? true : undefined}
          className={controlClass}
        />
      </div>
      <Button type="submit" loading={busy} aria-label={`Add goal for ${label.toLowerCase()}`}>
        Add
      </Button>
      </div>
    </form>
  );
}

function GoalRow({ goal, canEdit, locked, onChanged }: { goal: GoalItem; canEdit: boolean; locked?: boolean; onChanged: () => void | Promise<void> }) {
  const { apiFetch } = useSession();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(goal.text);
  const [done, setDone] = useState(goal.done);
  const root = useRef<HTMLLIElement>(null);
  useFocusSwap(editing, root);
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
    <li ref={root} className="flex items-start gap-3 rounded-md border border-line bg-card p-3">
      <Checkbox
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
          <input value={text} maxLength={280} onChange={(e) => setText(e.target.value)} aria-label="Goal text" className={`${controlClass} flex-1`} />
          <Button type="submit">Save</Button>
          <Button variant="ghost" onClick={() => { setText(goal.text); setEditing(false); }}>
            Cancel
          </Button>
        </form>
      ) : (
        <>
          {locked ? (
            <input value={goal.text} readOnly disabled aria-label={`Goal (locked until your first day): ${goal.text}`} className={`${controlClass} flex-1`} />
          ) : (
            <span className={done ? "flex-1 text-muted line-through" : "flex-1"}>{goal.text}</span>
          )}
          {locked && <Lock aria-hidden className="mt-3 size-5 shrink-0 text-muted" strokeWidth={1.8} />}
          {canEdit && (
            <Button data-opener variant="ghost" size="icon" aria-label={`Edit goal: ${goal.text}`} onClick={() => setEditing(true)}>
              <Pencil aria-hidden className="size-5" />
            </Button>
          )}
        </>
      )}
    </li>
  );
}

/** FR-4.9 30-60-90 goals (starter can add, edit and tick) and FR-5.1 cascaded goals (read-only). */
export function GoalsPanel({ journeyId, goals, canEdit, lockedUntil, onChanged }: Props) {
  const cascaded = goals.filter((g) => g.horizon === "CASCADED");
  return (
    <div className="space-y-4">
      {lockedUntil ? (
        <Alert tone="info" title="Your goals are locked for now">
          <p className="flex items-start gap-1.5">
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
            You can edit your goals from your first day ({formatLongDate(lockedUntil)}).
          </p>
        </Alert>
      ) : (
        !canEdit && (
          <Alert tone="info">
            <p>These goals are read-only for you.</p>
          </Alert>
        )
      )}
      {HORIZONS.map((h) => {
        const list = goals.filter((g) => g.horizon === h.key);
        return (
          <Card as="section" key={h.key} aria-labelledby={`goals-${h.key}`}>
            <h2 id={`goals-${h.key}`} className="text-lg font-bold">
              {h.label}
            </h2>
            {list.length === 0 ? (
              <p className="mt-2 text-muted">{lockedUntil ? "No goals yet. You can add yours from your first day." : "No goals yet. Agree a few with your line manager."}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {list.map((g) => (
                  <GoalRow key={`${g.id}:${g.text}:${g.done}`} goal={g} canEdit={canEdit} locked={!!lockedUntil} onChanged={onChanged} />
                ))}
              </ul>
            )}
            {canEdit && <AddGoal horizon={h.key} label={h.label} journeyId={journeyId} onAdded={onChanged} />}
          </Card>
        );
      })}
      <Card as="section" aria-labelledby="goals-cascaded">
        <h2 id="goals-cascaded" className="text-lg font-bold">
          Goals from your line manager
        </h2>
        {cascaded.length === 0 ? (
          <p className="mt-2 text-muted">Your line manager hasn&apos;t shared any cascaded goals yet. They will appear here by Day 30.</p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {cascaded.map((g) => (
              <li key={g.id}>{g.text}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-muted">These are set by your line manager and can&apos;t be edited here.</p>
      </Card>
    </div>
  );
}
