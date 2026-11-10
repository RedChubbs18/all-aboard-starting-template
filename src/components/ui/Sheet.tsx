"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** "sheet": bottom sheet on mobile / right drawer on desktop. "dialog": centred confirm. */
  variant?: "sheet" | "dialog";
}

/**
 * Native <dialog> modal: focus trap, Esc to close and focus return come from the platform.
 * Always labelled by its title and has a visible 44px close button.
 */
export function Sheet({ open, onClose, title, children, variant = "sheet" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "app-dialog m-0 bg-card p-0 text-ink shadow-card",
        variant === "sheet"
          ? "sheet-up fixed inset-x-0 bottom-0 top-auto max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-lg lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[420px] lg:rounded-none lg:rounded-l-lg"
          : "m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-lg",
      )}
    >
      {open && (
        <div className={variant === "sheet" ? "p-4" : "p-6"}>
          {variant === "sheet" && <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong lg:hidden" />}
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-xl font-bold">
              {title}
            </h2>
            <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
              <X aria-hidden className="size-5" />
            </Button>
          </div>
          <div className="mt-3">{children}</div>
        </div>
      )}
    </dialog>
  );
}
