"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/client";
import { isPnpAdminPath } from "@/lib/auth/roles";

export const inputCls =
  "min-h-11 w-full rounded-sm border-2 border-border bg-surface px-3 py-2 text-base text-text focus-visible:outline-3 focus-visible:outline-info";
export const btnCls = {
  primary: "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 font-semibold text-surface hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60",
  secondary: "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border-2 border-brand bg-surface px-4 font-semibold text-brand hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-60",
  danger: "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-danger px-4 font-semibold text-surface hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-60",
};

export type Fields = Record<string, string>;
export type SendResult<T = unknown> = { ok: true; data: T } | { ok: false; message: string; fields: Fields; status: number };

/** Write calls to /api/admin/* with the session's credentials. */
export function useSend() {
  const { apiFetch } = useSession();
  return useCallback(
    async <T,>(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<SendResult<T>> => {
      try {
        const r = await apiFetch(path, {
          method,
          headers: body === undefined ? undefined : { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const json = await r.json().catch(() => ({}));
        if (r.ok) return { ok: true, data: json as T };
        const message = r.status === 403 ? "You do not have permission to do this." : (json.message as string) || `Request failed (${r.status})`;
        return { ok: false, message, fields: (json.fields as Fields) ?? {}, status: r.status };
      } catch {
        return { ok: false, message: "Could not reach the server. Try again.", fields: {}, status: 0 };
      }
    },
    [apiFetch],
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "success" | "warning" | "danger"; children: ReactNode }) {
  const styles = {
    info: "bg-[#e4effb] text-text border-info",
    success: "bg-[#e2f3e8] text-text border-success",
    warning: "bg-[#fdf1d8] text-text border-warning",
    danger: "bg-[#fbe6e4] text-text border-danger",
  }[kind];
  const label = { info: "Note", success: "Success", warning: "Warning", danger: "Error" }[kind];
  return (
    <div role={kind === "danger" ? "alert" : "status"} className={`rounded-md border-l-4 p-3 ${styles}`}>
      <strong className="mr-1">{label}:</strong>
      {children}
    </div>
  );
}

/** Label + control + error text linked with aria-describedby. */
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: (p: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode }) {
  const id = useId();
  const desc = [error && `${id}-err`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {children({ id, "aria-describedby": desc, "aria-invalid": error ? true : undefined })}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-sm font-medium text-danger">
          Error: {error}
        </p>
      )}
    </div>
  );
}

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/seed", label: "Seed a starter" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/teams", label: "Teams & people" },
  { href: "/admin/journeys", label: "Journeys" },
  { href: "/admin/adapters", label: "Adapters" },
  { href: "/admin/simulate", label: "Simulate" },
];

export function AdminTabs() {
  const path = usePathname();
  const { user } = useSession();
  const isAdmin = !!user?.roles.includes("ADMIN");
  const tabs = isAdmin ? TABS : TABS.filter((t) => isPnpAdminPath(t.href)); // P&P only sees the pages they may use
  return (
    <nav aria-label="Admin sections" className="mb-4 overflow-x-auto">
      <ul className="flex gap-1 border-b border-border">
        {tabs.map((t) => {
          const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center whitespace-nowrap rounded-t-md px-3 text-sm font-medium ${active ? "border-b-4 border-brand bg-brand-soft text-brand-strong" : "text-text hover:bg-surface-alt"}`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Native <dialog> modal: focus trap, Esc to close, focus returns to the opener. Right drawer on desktop. */
export function Drawer({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
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
      className="m-0 mt-auto max-h-[90dvh] w-full overflow-y-auto rounded-t-lg bg-surface p-4 text-text shadow-card backdrop:bg-text/50 lg:ml-auto lg:mt-0 lg:h-dvh lg:max-h-none lg:w-[480px] lg:rounded-none lg:rounded-l-lg"
    >
      {open && (
        <>
          <div className="mb-4 flex items-start justify-between gap-2">
            <h2 id={titleId} className="text-xl font-semibold text-brand-strong">
              {title}
            </h2>
            <button type="button" onClick={onClose} className={btnCls.secondary}>
              Close
            </button>
          </div>
          {children}
        </>
      )}
    </dialog>
  );
}

/** Confirm dialog (cancel first in DOM order). */
export function Confirm({ title, message, confirmLabel, open, onCancel, onConfirm, busy }: { title: string; message: ReactNode; confirmLabel: string; open: boolean; onCancel: () => void; onConfirm: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={id} onClose={onCancel} className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg bg-surface p-6 text-text shadow-card backdrop:bg-text/50">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      <div className="mt-2 text-text-muted">{message}</div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={btnCls.secondary}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} aria-busy={busy} className={btnCls.danger}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

/** Polite status line for success and error messages after an action. */
export function useNotice() {
  const [notice, setNotice] = useState<{ kind: "success" | "danger"; text: string } | null>(null);
  const el = notice && <Alert kind={notice.kind}>{notice.text}</Alert>;
  return { notice: el, success: (text: string) => setNotice({ kind: "success", text }), fail: (text: string) => setNotice({ kind: "danger", text }), clear: () => setNotice(null) };
}

export const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
