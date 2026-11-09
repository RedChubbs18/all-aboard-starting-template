"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ToastItem {
  id: number;
  kind: "success" | "error";
  title: string;
  lines: string[];
}

/** Toast state. Success toasts auto-dismiss after 5s (paused on hover/focus); errors persist until dismissed (WCAG 2.2.1). */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((t: Omit<ToastItem, "id">) => {
    const id = next.current++;
    setToasts((all) => [...all.slice(-3), { ...t, id }]);
  }, []);
  return { toasts, push, dismiss };
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (toast.kind !== "success" || paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast, paused, onDismiss]);
  const error = toast.kind === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`flex gap-2 rounded-md p-3 text-surface shadow-card ${error ? "bg-danger" : "bg-brand-strong"}`}
    >
      <span aria-hidden="true" className="font-bold">{error ? "!" : "✓"}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{toast.title}</p>
        {toast.lines.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-sm">
            {toast.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="min-h-11 min-w-11 rounded-md font-semibold hover:bg-surface/20"
        aria-label={`Dismiss: ${toast.title}`}
      >
        <span aria-hidden="true">{"×"}</span>
      </button>
    </div>
  );
}

export function Toaster({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed inset-x-3 top-3 z-50 flex flex-col gap-2 lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-auto lg:w-96">
      {toasts.map((t) => <Toast key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}
