"use client";

import { useCallback, useId, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/client";
import { isPnpAdminPath } from "@/lib/auth/roles";
import { Alert as SharedAlert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { ChipLink } from "@/components/ui/Chip";
import { controlClass } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";

export const inputCls = controlClass;

export const btnCls = {
  primary: buttonClass("primary"),
  secondary: buttonClass("secondary"),
  danger: buttonClass("danger"),
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
  const label = { info: "Note", success: "Success", warning: "Warning", danger: "Error" }[kind];
  return (
    <SharedAlert tone={kind} live={kind === "danger" ? "alert" : "status"}>
      <strong className="mr-1">{label}:</strong>
      {children}
    </SharedAlert>
  );
}

/** Label + control + error text linked with aria-describedby. */
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: (p: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode }) {
  const id = useId();
  const desc = [error && `${id}-err`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children({ id, "aria-describedby": desc, "aria-invalid": error ? true : undefined })}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-sm font-medium text-blocked">
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
    <nav aria-label="Admin sections" className="mb-4">
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((t) => {
          const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
          return (
            <li key={t.href} className="shrink-0">
              <ChipLink href={t.href} current={active}>
                {t.label}
              </ChipLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Right drawer on desktop, bottom sheet on mobile (the shared Sheet). */
export function Drawer({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {children}
    </Sheet>
  );
}

/** Confirm dialog (cancel first in DOM order). */
export function Confirm({ title, message, confirmLabel, open, onCancel, onConfirm, busy }: { title: string; message: ReactNode; confirmLabel: string; open: boolean; onCancel: () => void; onConfirm: () => void; busy?: boolean }) {
  return (
    <Sheet open={open} onClose={onCancel} title={title} variant="dialog">
      <div className="text-muted">{message}</div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={btnCls.secondary}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} aria-busy={busy} className={btnCls.danger}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

/** Polite status line for success and error messages after an action. */
export function useNotice() {
  const [notice, setNotice] = useState<{ kind: "success" | "danger"; text: string } | null>(null);
  const el = notice && <Alert kind={notice.kind}>{notice.text}</Alert>;
  return { notice: el, success: (text: string) => setNotice({ kind: "success", text }), fail: (text: string) => setNotice({ kind: "danger", text }), clear: () => setNotice(null) };
}

export const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
