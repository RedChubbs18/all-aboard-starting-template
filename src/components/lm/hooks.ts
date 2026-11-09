"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth/client";
import type { ApiErrorBody, StarterDetail } from "./types";
import type { ToastMsg } from "./ui";

export interface MutateResult {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
}

interface Request {
  path: string;
  method: "POST" | "PUT" | "PATCH";
  body: unknown;
}

/**
 * Loads one starter and applies changes optimistically: the UI updates at once from
 * `optimistic(prev)`, the server answers with the full revalidated detail, and a failure rolls back.
 */
export function useStarterDetail(journeyId: string) {
  const { apiFetch, status } = useSession();
  const [data, setData] = useState<StarterDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef<StarterDetail | null>(null);

  const commit = useCallback((d: StarterDetail | null) => {
    ref.current = d;
    setData(d);
  }, []);

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    apiFetch(`/api/lm/starters/${journeyId}`)
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(
            r.status === 403 ? "This starter is not on your team." : r.status === 404 ? "We couldn't find that starter." : `Request failed (${r.status})`,
          );
        }
        return (await r.json()) as StarterDetail;
      })
      .then((d) => {
        if (cancelled) return;
        commit(d);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Request failed"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status, apiFetch, journeyId, commit, tick]);

  const load = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);

  const mutate = useCallback(
    async (req: Request, optimistic?: (d: StarterDetail) => StarterDetail): Promise<MutateResult> => {
      const prev = ref.current;
      if (optimistic && prev) commit(optimistic(prev));
      try {
        const r = await apiFetch(req.path, {
          method: req.method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(req.body),
        });
        const body = (await r.json().catch(() => null)) as (StarterDetail & ApiErrorBody) | null;
        if (!r.ok || !body) {
          commit(prev);
          return { ok: false, message: body?.message ?? `Something went wrong (${r.status}).`, fields: body?.fields };
        }
        commit(body);
        return { ok: true };
      } catch {
        commit(prev);
        return { ok: false, message: "We couldn't reach the server. Your change was not saved." };
      }
    },
    [apiFetch, commit],
  );

  return { data, error, loading, reload: load, mutate };
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((tone: ToastMsg["tone"], text: string) => setToasts((t) => [...t, { id: next.current++, tone, text }]), []);
  return { toasts, dismiss, success: (t: string) => push("success", t), fail: (t: string) => push("error", t) };
}
