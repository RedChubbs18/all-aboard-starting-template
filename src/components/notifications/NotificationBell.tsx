"use client";

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
export function NotificationBell({ pollMs = POLL_MS }: { pollMs?: number }) {
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
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-brand-soft"
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span aria-hidden="true" className="absolute right-1 top-1 min-w-5 rounded-full bg-danger px-1 text-center text-xs font-bold leading-5 text-surface">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <span className="sr-only" aria-live="polite">{unread > 0 ? `${unread} unread notifications` : ""}</span>

      {open && (
        <section
          id={panelId}
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 max-h-[70dvh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-md border border-border bg-surface text-text shadow-card"
        >
          <h2 className="border-b border-border px-4 py-3 text-base font-semibold">Notifications</h2>
          {failed && <p role="alert" className="px-4 py-2 text-sm text-danger">Could not refresh. Showing the last list.</p>}
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-text-muted">You are all caught up.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id} className={`border-b border-border last:border-0 ${n.read ? "" : "bg-brand-soft"}`}>
                  <div className="flex items-start gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {!n.read && <span className="sr-only">Unread: </span>}
                        {n.title}
                      </p>
                      <p className="mt-0.5 text-sm text-text-muted">{n.body}</p>
                      <p className="mt-1 text-xs text-text-muted">
                        <time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString()}</time>
                      </p>
                      {n.link && (
                        <a href={n.link} onClick={() => void markRead(n)} className="mt-1 inline-flex min-h-11 items-center text-brand underline underline-offset-2">
                          Open
                        </a>
                      )}
                    </div>
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => void markRead(n)}
                        className="min-h-11 shrink-0 rounded-md px-2 text-sm font-semibold text-brand hover:bg-brand-soft"
                        aria-label={`Mark as read: ${n.title}`}
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
