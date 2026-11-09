"use client";

import { Mail } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useSession } from "@/lib/auth/client";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

const POLL_MS = 15_000;

/**
 * Bell with an unread badge and an accessible popover list. Polls /api/notifications every ~15s while the tab is visible.
 * Mount it inside the signed-in shell (it renders nothing when signed out).
 */
export function NotificationBell({ pollMs = POLL_MS, align = "right" }: { pollMs?: number; align?: "left" | "right" }) {
  const { apiFetch, status } = useSession();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/notifications");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { notifications: NotificationItem[]; unread: number };
      setItems(data.notifications);
      setUnread(data.unread);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const first = setTimeout(load, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, pollMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [status, load, pollMs]);

  // Close on Escape (return focus to the bell) and on outside click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  async function markRead(n: NotificationItem) {
    if (n.read) return;
    setItems((all) => all.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      const res = await apiFetch(`/api/notifications/${encodeURIComponent(n.id)}/read`, { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      void load(); // roll back to the server's view
    }
  }

  if (status !== "authenticated") return null;

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative inline-flex size-11 items-center justify-center rounded-full border-[1.5px] border-ink bg-card text-ink hover:bg-page"
      >
        <Mail aria-hidden className="size-[22px]" strokeWidth={1.8} />
        {unread > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-5 rounded-full bg-blocked px-1 text-center text-xs font-bold leading-5 text-card">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <span className="sr-only" aria-live="polite">{unread > 0 ? `${unread} unread notifications` : ""}</span>

      {open && (
        <section
          id={panelId}
          aria-label="Notifications"
          className={`absolute ${align === "left" ? "left-0" : "right-0"} z-50 mt-2 max-h-[70dvh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-line bg-card text-ink shadow-card`}
        >
          <h2 className="border-b border-line px-4 py-3 text-base font-semibold">Notifications</h2>
          {failed && <p role="alert" className="px-4 py-2 text-sm text-blocked">Could not refresh. Showing the last list.</p>}
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-muted">You are all caught up.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id} id={`notif-${panelId}-${n.id}`} tabIndex={-1} className={`border-b border-line last:border-0 focus-inset ${n.read ? "" : "bg-brand-tint"}`}>
                  <div className="flex items-start gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {!n.read && <span className="sr-only">Unread: </span>}
                        {n.title}
                      </p>
                      <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                      <p className="mt-1 text-xs text-muted">
                        <time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString()}</time>
                      </p>
                      {n.link && (
                        <a href={n.link} onClick={() => void markRead(n)} className="mt-1 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-2">
                          Open
                        </a>
                      )}
                    </div>
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => {
                          // This button disappears once read: keep focus inside the list (WCAG 2.4.3).
                          document.getElementById(`notif-${panelId}-${n.id}`)?.focus();
                          void markRead(n);
                        }}
                        className="min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-brand-strong hover:bg-brand-tint"
                        aria-label={`Mark read: ${n.title}`}
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
