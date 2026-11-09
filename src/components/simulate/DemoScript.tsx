"use client";

export type DemoStepId =
  | "firstadvantage_action_needed"
  | "firstadvantage_cleared"
  | "offer_conditions_met"
  | "system_tasks"
  | "jump_day0"
  | "reset";

/** One-click steps for REQUIREMENTS section 12 (steps 4 to 7). They always act on the demo starter (alex-morgan). */
export const DEMO_SCRIPT: { step: DemoStepId; label: string; hint: string }[] = [
  { step: "firstadvantage_action_needed", label: "First Advantage: action needed", hint: "Blocks the vetting task, flags the journey and sends a reminder." },
  { step: "firstadvantage_cleared", label: "First Advantage: cleared", hint: "Completes the vetting task and clears the flag." },
  { step: "offer_conditions_met", label: "P&P: offer conditions met", hint: "Completes the P&P gating task so the stage can advance." },
  { step: "system_tasks", label: "Complete system tasks (account, SailPoint, Colleague File ID)", hint: "Unlocks the IT request tasks." },
  { step: "jump_day0", label: "Jump to Day 0", hint: "Completes earlier tasks and sets consistent mock data." },
  { step: "reset", label: "Reset demo starter", hint: "Returns the demo starter to the start of the journey." },
];

interface Props {
  busy: string | null;
  onRun: (step: DemoStepId) => void;
}

export function DemoScript({ busy, onRun }: Props) {
  return (
    <section aria-labelledby="demo-script-h" className="rounded-md border border-border bg-surface p-4 shadow-card">
      <h2 id="demo-script-h" className="text-lg font-semibold text-brand-strong">Demo script</h2>
      <p className="mt-1 text-sm text-text-muted">Runs against the demo starter, Alex Morgan. Follow the steps in order.</p>
      <ol className="mt-3 space-y-3">
        {DEMO_SCRIPT.map((s, i) => (
          <li key={s.step} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => onRun(s.step)}
              disabled={busy !== null}
              aria-describedby={`demo-hint-${s.step}`}
              aria-busy={busy === s.step}
              className={`min-h-11 rounded-md px-4 py-2 text-left font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
                s.step === "reset" ? "border-2 border-danger bg-surface text-danger hover:bg-surface-alt" : "bg-brand text-surface hover:bg-brand-strong"
              }`}
            >
              <span className="mr-2">{i + 1}.</span>
              {s.label}
              {busy === s.step && <span className="ml-2 text-sm font-normal">Working…</span>}
            </button>
            <span id={`demo-hint-${s.step}`} className="px-1 text-sm text-text-muted">{s.hint}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
