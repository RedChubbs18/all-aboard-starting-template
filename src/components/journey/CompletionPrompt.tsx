"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { needsCompletionPrompt } from "./task-rules";
import type { TaskDto } from "./types";

interface DialogProps {
  open: boolean;
  title: string;
  onYes: () => void;
  onNo: () => void;
  /** Fires once the dialog has actually closed, whichever way (buttons, Esc, backdrop, close button). */
  onClosed: () => void;
}

/** D30: "Is this task complete?" for tasks that need action or input. A native modal dialog (focus trap, Esc, focus return). */
export function CompletionPrompt({ open, title, onYes, onNo, onClosed }: DialogProps) {
  return (
    <Sheet
      open={open}
      variant="dialog"
      title="Is this task complete?"
      onClose={() => {
        onNo();
        onClosed();
      }}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-muted">Only say yes if you have finished it. You can come back to it any time.</p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onNo}>
          Not yet, I&apos;ll come back to it
        </Button>
        <Button onClick={onYes}>Yes, mark as done</Button>
      </div>
    </Sheet>
  );
}

/**
 * D30 gate for a "Mark done" click. `trigger()` completes straight away for reading and flow tasks, and opens the
 * prompt for tasks that need action or input. Render `dialog` once next to the button. The completion runs after the
 * dialog has closed, so focus is handed back before the task changes.
 */
export function useCompletionGate(
  task: Pick<TaskDto, "type" | "key" | "title" | "autoCompleteOnOpen">,
  run: () => void | Promise<void>,
): { trigger: () => void; dialog: ReactNode } {
  const [open, setOpen] = useState(false);
  const yes = useRef(false);
  const trigger = () => (needsCompletionPrompt(task) ? setOpen(true) : void run());
  const dialog = (
    <CompletionPrompt
      open={open}
      title={task.title}
      onYes={() => {
        yes.current = true;
        setOpen(false);
      }}
      onNo={() => setOpen(false)}
      onClosed={() => {
        if (!yes.current) return;
        yes.current = false;
        void run();
      }}
    />
  );
  return { trigger, dialog };
}
