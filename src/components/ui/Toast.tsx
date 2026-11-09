"use client";

import { CheckCircle2, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

type Tone = "success" | "error";
interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
  lines?: string[];
}
interface ToastApi {
  success(message: string, lines?: string[]): void;
  error(message: string, lines?: string[]): void;
}

const Ctx = createContext<ToastApi | null>(null);

/** No-op fallback so components using toasts also render in isolation (tests, other workstreams). */
const NOOP: ToastApi = { success() {}, error() {} };
export const useToast = (): ToastApi => useContext(Ctx) ?? NOOP;

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const paused = useRef(false);
  useEffect(() => {
    if (item.tone !== "success") return; // errors persist until dismissed (WCAG 2.2.1)
    let t = window.setTimeout(tick, 5000);
    function tick() {
      if (paused.current) t = window.setTimeout(tick, 1000);
      else onDismiss(item.id);
    }
    return () => window.clearTimeout(t);
  }, [item, onDismiss]);
  const Icon = item.tone === "success" ? CheckCircle2 : XCircle;
  return (
    <div
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)}
      onBlur={() => (paused.current = false)}
      className={cn("flex items-center gap-2 rounded-md p-3 text-card", item.tone === "success" ? "bg-dark-green" : "bg-blocked")}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p>{item.message}</p>
        {item.lines && item.lines.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-sm">
            {item.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </div>
      <Button variant="ghost" size="icon" aria-label="Dismiss" className="text-card hover:bg-card/20" onClick={() => onDismiss(item.id)}>
        <X aria-hidden className="size-5" />
      </Button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((x) => x.id !== id)), []);
  const push = useCallback((tone: Tone, message: string, lines?: string[]) => setItems((l) => [...l.slice(-3), { id: ++seq.current, tone, message, lines }]), []);
  const api = useMemo<ToastApi>(() => ({ success: (m, lines) => push("success", m, lines), error: (m, lines) => push("error", m, lines) }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 top-3 z-50 flex flex-col gap-2 lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-auto lg:w-96">
        {/* Both regions are always mounted so announcements are reliable. */}
        <div role="status" aria-live="polite" className="pointer-events-auto flex flex-col gap-2">
          {items.filter((i) => i.tone === "success").map((i) => (
            <ToastView key={i.id} item={i} onDismiss={dismiss} />
          ))}
        </div>
        <div role="alert" className="pointer-events-auto flex flex-col gap-2">
          {items.filter((i) => i.tone === "error").map((i) => (
            <ToastView key={i.id} item={i} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </Ctx.Provider>
  );
}
