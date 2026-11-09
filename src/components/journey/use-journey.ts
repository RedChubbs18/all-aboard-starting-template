"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth/client";
import { applyOptimisticDone } from "./derive";
import type { JourneyResponse } from "./types";

/**
 * Module-level cache so the journey home, task detail and back navigation share one copy:
 * completing a task on the detail page is already reflected when you go back (no reload, no flash).
 * Keyed by viewer + journey so switching demo persona never shows someone else's data.
 */
const cache = new Map<string, JourneyResponse>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Store under the requested key and its aliases (by journey id, and "me" when no id was requested). */
function store(key: string, data: JourneyResponse) {
  const uid = key.slice(0, key.lastIndexOf(":"));
  cache.set(key, data);
  cache.set(`${uid}:${data.journey.id}`, data);
  if (key.endsWith(":me")) cache.set(`${uid}:me`, data);
}

export interface CompleteResult {
  ok: boolean;
  error?: string;
  title?: string;
}

export interface UseJourney {
  data: JourneyResponse | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  /** Optimistic: update immediately, POST, then revalidate. Rolls back on failure. */
  complete: (taskId: string) => Promise<CompleteResult>;
  pendingId: string | null;
  lastCompletedTitle: string | undefined;
}

export function useJourney(journeyId?: string | null): UseJourney {
  const { apiFetch, user, status } = useSession();
  const key = user ? `${user.id}:${journeyId ?? "me"}` : null;
  const [, force] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [lastCompletedTitle, setLast] = useState<string | undefined>();
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  const url = `/api/starter/journey${journeyId ? `?journeyId=${encodeURIComponent(journeyId)}` : ""}`;

  const reload = useCallback(async () => {
    const k = keyRef.current;
    if (!k) return;
    try {
      const r = await apiFetch(url);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message ?? `Request failed (${r.status})`);
      }
      const data = (await r.json()) as JourneyResponse;
      if (keyRef.current === k) {
        store(k, data);
        setError(null);
        notify();
      }
    } catch (e) {
      if (keyRef.current === k) setError(e instanceof Error ? e.message : "Request failed");
    }
  }, [apiFetch, url]);

  useEffect(() => {
    if (status !== "authenticated" || !key) return;
    const t = setTimeout(() => void reload(), 0);
    return () => clearTimeout(t);
  }, [status, key, reload]);

  const data = key ? (cache.get(key) ?? null) : null;

  const complete = useCallback(
    async (taskId: string): Promise<CompleteResult> => {
      const k = keyRef.current;
      const before = k ? cache.get(k) : undefined;
      if (!k) return { ok: false, error: "Not signed in" };
      const task = before?.journey.tasks.find((t) => t.id === taskId);
      setPendingId(taskId);
      if (before && task) {
        store(k, {
          ...before,
          journey: { ...before.journey, tasks: applyOptimisticDone(before.journey.tasks, taskId, before.journey.currentStage) },
        });
        setLast(task.title);
        notify();
      }
      try {
        const r = await apiFetch(`/api/starter/tasks/${taskId}/status`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "DONE" }),
        });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.message ?? "Couldn't save that. Please try again.");
        }
        await reload();
        return { ok: true, title: task?.title };
      } catch (e) {
        if (before) store(k, before);
        notify();
        return { ok: false, error: e instanceof Error ? e.message : "Couldn't save that. Please try again." };
      } finally {
        setPendingId(null);
      }
    },
    [apiFetch, reload],
  );

  return { data, error, loading: !data && !error, reload, complete, pendingId, lastCompletedTitle };
}

/** Test helper. */
export const __resetJourneyCache = () => cache.clear();
