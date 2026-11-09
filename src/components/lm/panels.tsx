"use client";

import { useRef, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { useFocusSwap } from "@/components/ui/use-focus-swap";
import { chatLink } from "@/lib/teams";
import { GOAL_HORIZONS, STAGES, type GoalHorizon } from "@/domain/types";
import { bespokeTaskSchema, teamItemSchema, buddySchema, CADENCES, checkInSchema, day0Schema, fieldErrors, goalPatchSchema, goalSchema } from "./schemas";
import { report, type PanelProps } from "./tasks";
import type { GoalDto, StarterDetail } from "./types";
import {
  Alert, Button, Card, ErrorSummary, ExternalLink, Icon, InfoBadge, Sheet, SelectField, STAGE_LABEL, TextArea, TextField, formatDate, formatDateTime, localToIso,
} from "./ui";

type Errors = Record<string, string>;
const firstError = (e: Errors) => Object.values(e)[0] ?? null;

/** `<input type="datetime-local">` value from an ISO string, in local time. */
const isoToLocal = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function Panel({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <Card className="space-y-3">
        <h2 id={id} className="text-xl font-bold text-ink">
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}

// -------------------------------------------------------------- buddy

/** FR-LM.4 / FR-1.3. Candidates are already filtered server-side (team, eligible, not LM). */
export function BuddyPanel(p: PanelProps) {
  const { d } = p;
  const [choice, setChoice] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = buddySchema.safeParse({ buddyId: choice });
    if (!v.success) {
      setAttempt((n) => n + 1);
      return setErrors(fieldErrors(v.error));
    }
    setErrors({});
    const c = d.buddyCandidates.find((x) => x.id === choice);
    setBusy(true);
    const r = await p.mutate({ path: `${p.base}/buddy`, method: "POST", body: v.data }, (cur) =>
      c ? { ...cur, buddy: { id: c.id, displayName: c.displayName, upn: c.upn, jobTitle: c.jobTitle, chatUrl: chatLink(c.upn) } } : cur,
    );
    setBusy(false);
    if (report(r, p, `${c?.displayName ?? "Buddy"} allocated`)) setChoice("");
    else {
      setAttempt((n) => n + 1);
      setErrors(r.fields ?? { buddyId: r.message ?? "That didn't work. Please try again." });
    }
  }

  return (
    <Panel id="buddy" title="Buddy">
      {d.buddy ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto">
            <span className="font-semibold">{d.buddy.displayName}</span>
            {d.buddy.jobTitle && <span className="text-muted"> · {d.buddy.jobTitle}</span>}
          </p>
          <ExternalLink href={d.buddy.chatUrl}>
            <Icon name="chat" /> Chat with buddy
          </ExternalLink>
        </div>
      ) : (
        <Alert tone="info">No buddy allocated yet. {d.starter.displayName} will see their buddy once you choose one.</Alert>
      )}
      {d.journey.status === "active" && (
        <form onSubmit={submit} noValidate className="space-y-3">
          {d.buddyCandidates.length === 0 ? (
            <p className="text-muted">No buddy-eligible people in this team. Ask P&P to mark team members as eligible.</p>
          ) : (
            <>
              <ErrorSummary message={Object.keys(errors).length ? firstError(errors) : null} focusKey={attempt} />
              <SelectField label={d.buddy ? "Change buddy" : "Choose a buddy"} value={choice} onChange={(e) => setChoice(e.target.value)} error={errors.buddyId} hint="Team members who have said they can be a buddy.">
                <option value="">Select a person</option>
                {d.buddyCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                    {c.jobTitle ? ` (${c.jobTitle})` : ""}
                  </option>
                ))}
              </SelectField>
              <Button type="submit" busy={busy} aria-disabled={busy || undefined}>
                {d.buddy ? "Change buddy" : "Allocate buddy"}
              </Button>
            </>
          )}
        </form>
      )}
    </Panel>
  );
}

// ----------------------------------------------------------- check-ins

const CADENCE_LABEL: Record<string, string> = { WEEKLY: "Weekly", FORTNIGHTLY: "Fortnightly", MONTHLY: "Monthly" };

/** FR-LM.3 / FR-4.7. The Teams meeting link is generated server-side and stored on the check-in. */
export function CheckInPanel(p: PanelProps) {
  const { d } = p;
  const [cadence, setCadence] = useState("");
  const [at, setAt] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const latest = d.checkIns[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { cadence, scheduledAt: localToIso(at) };
    const v = checkInSchema.safeParse(body);
    if (!v.success) return setErrors(fieldErrors(v.error));
    setErrors({});
    setBusy(true);
    const r = await p.mutate({ path: `${p.base}/check-ins`, method: "POST", body: v.data });
    setBusy(false);
    if (report(r, p, "Check-in agreed and Teams link created")) {
      setCadence("");
      setAt("");
    } else if (r.fields) setErrors(r.fields);
  }

  return (
    <Panel id="checkins" title="Check-ins">
      {latest ? (
        <div className="space-y-2">
          <p>
            <span className="font-semibold">{CADENCE_LABEL[latest.cadence] ?? latest.cadence}</span> from {formatDateTime(latest.scheduledAt)}
          </p>
          {latest.meetingLink && (
            <ExternalLink href={latest.meetingLink}>
              <Icon name="link" /> Open Teams meeting
            </ExternalLink>
          )}
          {d.checkIns.length > 1 && <p className="text-sm text-muted">{d.checkIns.length - 1} earlier check-in {d.checkIns.length === 2 ? "arrangement" : "arrangements"} replaced.</p>}
        </div>
      ) : (
        <p className="text-muted">No check-ins agreed yet.</p>
      )}
      {d.journey.status === "active" && (
        <form onSubmit={submit} noValidate className="space-y-3">
          <ErrorSummary message={Object.keys(errors).length ? firstError(errors) : null} />
          <SelectField label="How often" value={cadence} onChange={(e) => setCadence(e.target.value)} error={errors.cadence}>
            <option value="">Select a cadence</option>
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {CADENCE_LABEL[c]}
              </option>
            ))}
          </SelectField>
          <TextField label="First check-in" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} error={errors.scheduledAt} hint="We create a Teams meeting link for you and the starter." />
          <Button type="submit" busy={busy} aria-disabled={busy || undefined}>
            {latest ? "Replace check-in" : "Agree check-in"}
          </Button>
        </form>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- day 0

/** FR-3.8. The starter confirms on their side; the LM sees the state. */
export function Day0Panel(p: PanelProps) {
  const { d } = p;
  const [open, setOpen] = useState(false);
  const [where, setWhere] = useState(d.day0?.where ?? "");
  const [who, setWho] = useState(d.day0?.who ?? "");
  const [when, setWhen] = useState(d.day0 ? isoToLocal(d.day0.whenAt) : "");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useFocusSwap(open, root);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = day0Schema.safeParse({ where, who, whenAt: localToIso(when) });
    if (!v.success) {
      setAttempt((n) => n + 1);
      return setErrors(fieldErrors(v.error));
    }
    setErrors({});
    setBusy(true);
    const r = await p.mutate({ path: `${p.base}/day0`, method: "PUT", body: v.data }, (cur) => ({
      ...cur,
      day0: { where: v.data.where, who: v.data.who, whenAt: v.data.whenAt, confirmedAt: null },
    }));
    setBusy(false);
    if (report(r, p, "Day 0 arrangement proposed")) setOpen(false);
    else if (r.fields) setErrors(r.fields);
  }

  return (
    <Panel id="day0" title="Day 0: your arrangements">
      <div ref={root} className="space-y-3">
      {d.day0 ? (
        <div className="space-y-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="font-semibold">Where</dt>
            <dd>{d.day0.where}</dd>
            <dt className="font-semibold">When</dt>
            <dd>{formatDateTime(d.day0.whenAt)}</dd>
            <dt className="font-semibold">Who</dt>
            <dd>{d.day0.who}</dd>
          </dl>
          {d.day0.confirmedAt ? (
            <Alert tone="success" title={`Confirmed on ${formatDate(d.day0.confirmedAt)}`} role="status" />
          ) : (
            <Alert tone="warning" title={`Waiting for ${d.starter.displayName.split(" ")[0]} to confirm`} />
          )}
        </div>
      ) : (
        <Alert tone="info" title="You haven't set up Day 0 yet">
          Tell {d.starter.displayName.split(" ")[0]} where to go, when, and who to ask for. They will see it and confirm.
        </Alert>
      )}
      {d.journey.status === "active" && !open && (
        <Button data-opener variant="secondary" onClick={() => setOpen(true)}>
          {d.day0 ? "Change arrangements" : "Set up Day 0"}
        </Button>
      )}
      {open && (
        <form onSubmit={submit} noValidate className="space-y-3">
          <ErrorSummary message={Object.keys(errors).length ? firstError(errors) : null} focusKey={attempt} />
          <TextField label="Where" value={where} maxLength={120} onChange={(e) => setWhere(e.target.value)} error={errors.where} hint="For example: Reception, 3rd floor" />
          <TextField label="When" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} error={errors.whenAt} />
          <TextField label="Who to meet or ask for" value={who} maxLength={120} onChange={(e) => setWho(e.target.value)} error={errors.who} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={busy} aria-disabled={busy || undefined}>
              Send proposal
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- goals

const HORIZON_LABEL: Record<GoalHorizon, string> = {
  "30": "First 30 days",
  "60": "By 60 days",
  "90": "By 90 days",
  CASCADED: "Cascaded performance goals",
};

function GoalRow({ g, p }: { g: GoalDto; p: PanelProps }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(g.text);
  const [error, setError] = useState<string>();
  const root = useRef<HTMLLIElement>(null);
  useFocusSwap(editing, root);
  const patch = (body: { text?: string; done?: boolean }, optimistic: (x: GoalDto) => GoalDto) =>
    p.mutate({ path: `${p.base}/goals/${g.id}`, method: "PATCH", body }, (d) => ({ ...d, goals: d.goals.map((x) => (x.id === g.id ? optimistic(x) : x)) }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v = goalPatchSchema.safeParse({ text });
    if (!v.success) return setError(v.error.issues[0].message);
    setError(undefined);
    setEditing(false);
    const r = await patch(v.data, (x) => ({ ...x, text: v.data.text ?? x.text }));
    if (!report(r, p, "Goal updated")) {
      setText(g.text);
      setEditing(true);
    }
  }

  if (editing) {
    return (
      <li ref={root}>
        <form onSubmit={save} noValidate className="space-y-2">
          <TextField label="Edit goal" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} error={error} />
          <div className="flex gap-2">
            <Button type="submit">Save</Button>
            <Button variant="ghost" onClick={() => { setEditing(false); setText(g.text); setError(undefined); }}>Cancel</Button>
          </div>
        </form>
      </li>
    );
  }
  return (
    <li ref={root} className="flex items-start gap-3">
      <Checkbox
        id={`goal-${g.id}`}
        checked={g.done}
        onChange={async (e) => {
          const done = e.target.checked;
          report(await patch({ done }, (x) => ({ ...x, done })), p, done ? "Goal achieved" : "Goal reopened");
        }}
      />
      <label htmlFor={`goal-${g.id}`} className={`flex-1 pt-2.5 ${g.done ? "text-muted line-through" : ""}`}>
        {g.text}
      </label>
      <Button data-opener variant="ghost" onClick={() => setEditing(true)} aria-label={`Edit goal: ${g.text}`}>
        Edit
      </Button>
    </li>
  );
}

/** FR-4.9 (30-60-90, edited with the starter) and FR-5.1 (CASCADED performance goals). */
export function GoalsPanel(p: PanelProps) {
  const { d } = p;
  const [horizon, setHorizon] = useState<string>("30");
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const v = goalSchema.safeParse({ horizon, text });
    if (!v.success) {
      setAttempt((n) => n + 1);
      return setErrors(fieldErrors(v.error));
    }
    setErrors({});
    setBusy(true);
    const r = await p.mutate({ path: `${p.base}/goals`, method: "POST", body: v.data }, (cur) => ({
      ...cur,
      goals: [...cur.goals, { id: `tmp-${Date.now()}`, horizon: v.data.horizon, text: v.data.text, done: false }],
    }));
    setBusy(false);
    if (report(r, p, "Goal added")) setText("");
    else if (r.fields) setErrors(r.fields);
  }

  return (
    <Panel id="goals" title="Goals">
      <p className="text-sm text-muted">The starter sees and can edit the same list.</p>
      {GOAL_HORIZONS.map((h) => {
        const list = d.goals.filter((g) => g.horizon === h);
        return (
          <div key={h}>
            <h3 className="mb-1 font-semibold">{HORIZON_LABEL[h]}</h3>
            {list.length === 0 ? <p className="text-sm text-muted">No goals yet.</p> : <ul className="space-y-1">{list.map((g) => <GoalRow key={g.id} g={g} p={p} />)}</ul>}
          </div>
        );
      })}
      <form onSubmit={add} noValidate className="space-y-3 border-t border-line pt-3">
        <ErrorSummary message={Object.keys(errors).length ? firstError(errors) : null} focusKey={attempt} />
        <SelectField label="Add a goal for" value={horizon} onChange={(e) => setHorizon(e.target.value)} error={errors.horizon}>
          {GOAL_HORIZONS.map((h) => (
            <option key={h} value={h}>
              {HORIZON_LABEL[h]}
            </option>
          ))}
        </SelectField>
        <TextField label="Goal" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} error={errors.text} />
        <Button type="submit" busy={busy} aria-disabled={busy || undefined}>
          <Icon name="plus" /> Add goal
        </Button>
      </form>
    </Panel>
  );
}

// ------------------------------------------------------ photo review

/** D12: the LM can recertify a rejected pass photo. Only the issues are shown; the image is never stored. */
export function PhotoReviewPanel(p: PanelProps) {
  const review = p.d.photoReview;
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (!review) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = justification.trim();
    if (v.length < 5) {
      setAttempt((n) => n + 1);
      return setError("Please give a short justification (at least 5 characters)");
    }
    setError(undefined);
    setBusy(true);
    const r = await p.mutate({ path: `${p.base}/photo-override`, method: "POST", body: { justification: v } }, (d) => ({ ...d, photoReview: null }));
    setBusy(false);
    if (!report(r, p, "Photo recertified")) {
      setAttempt((n) => n + 1);
      setError(r.fields?.justification ?? r.message);
    }
  }

  return (
    <Panel id="photo-review" title="Review photo check">
      <Alert tone="warning" title="The ID photo did not pass the automatic check">
        The photo itself is not stored, so only the issues found are shown.
      </Alert>
      {review.issues.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5">
          {review.issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">No issue details were recorded.</p>
      )}
      <form onSubmit={submit} noValidate className="space-y-3">
        <ErrorSummary message={error ?? null} focusKey={attempt} />
        <TextArea label="Why is this photo acceptable?" value={justification} maxLength={300} onChange={(e) => setJustification(e.target.value)} error={error} hint="Required. Recorded in the audit trail. Do not include personal details." />
        <Button type="submit" busy={busy} aria-disabled={busy || undefined}>
          Recertify photo
        </Button>
      </form>
    </Panel>
  );
}

// ------------------------------------------------------- bespoke task

/** FR-3.6. Creates a starter-owned task that appears on the starter's journey straight away. */
export function BespokeTaskSheet({ open, onClose, ...p }: PanelProps & { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = bespokeTaskSchema.safeParse({ title, description, stage, dueDate });
    if (!v.success) return setErrors(fieldErrors(v.error));
    setErrors({});
    setBusy(true);
    const due = `${v.data.dueDate.slice(0, 10)}T12:00:00.000Z`;
    const r = await p.mutate({ path: `${p.base}/tasks`, method: "POST", body: v.data }, (d: StarterDetail) => ({
      ...d,
      tasks: [
        ...d.tasks,
        {
          id: `tmp-${Date.now()}`, key: `tmp-${Date.now()}`, title: v.data.title, description: v.data.description ?? "", stage: v.data.stage, owner: "STARTER", type: "ACTION",
          status: "TODO", source: "BESPOKE", dueDate: due, completedAt: null, blockedReason: null, evidence: null, overdue: new Date(due) < new Date(), waitingFor: [], canAct: false,
        },
      ],
    }));
    setBusy(false);
    if (report(r, p, "Task added to the starter's journey")) {
      setTitle(""); setDescription(""); setStage(""); setDueDate("");
      onClose();
    } else if (r.fields) setErrors(r.fields);
  }

  return (
    <Sheet open={open} title="Add a bespoke task" onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <ErrorSummary message={Object.keys(errors).length ? firstError(errors) : null} />
        <InfoBadge>The starter will see this task straight away</InfoBadge>
        <TextField label="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
        <TextArea label="Description (optional)" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
        <SelectField label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} error={errors.stage}>
          <option value="">Select a stage</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </SelectField>
        <TextField label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} error={errors.dueDate} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" busy={busy} aria-disabled={busy || undefined}>
            Add task
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------ team checklist item (F11)

export function TeamItemSheet({ open, onClose, ...p }: PanelProps & { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [owner, setOwner] = useState("LM");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = teamItemSchema.safeParse({ title, description, dueDate, owner });
    if (!v.success) return setErrors(fieldErrors(v.error));
    setErrors({});
    setBusy(true);
    const r = await p.mutate({ path: `${p.base}/team-items`, method: "POST", body: v.data });
    setBusy(false);
    if (report(r, p, "Team checklist item added")) {
      setTitle(""); setDescription(""); setDueDate(""); setOwner("LM");
      onClose();
    } else if (r.fields) setErrors(r.fields);
  }

  return (
    <Sheet open={open} title="Add team checklist item" onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <ErrorSummary message={Object.keys(errors).length ? firstError(errors) : null} />
        <TextField label="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
        <TextArea label="Description (optional)" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
        <TextField label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} error={errors.dueDate} />
        <SelectField label="Who does this" value={owner} onChange={(e) => setOwner(e.target.value)} error={errors.owner}>
          <option value="LM">Me (the line manager)</option>
          <option value="STARTER">The starter</option>
        </SelectField>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" busy={busy} aria-disabled={busy || undefined}>
            Add item
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
