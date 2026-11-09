"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "./client";

/** GET a role-guarded API route with the session's credentials. `reload()` refetches. */
export function useApi<T>(path: string | null) {
  const { apiFetch, status } = useSession();
  const [result, setResult] = useState<{ path: string; data: T | null; error: string | null } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path || status !== "authenticated") return;
    let cancelled = false;
    apiFetch(path)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "You do not have access to this." : `Request failed (${r.status})`);
        return (await r.json()) as T;
      })
      .then((data) => !cancelled && setResult({ path, data, error: null }))
      .catch((e) => !cancelled && setResult({ path, data: null, error: e instanceof Error ? e.message : "Request failed" }));
    return () => {
      cancelled = true;
    };
  }, [path, status, apiFetch, tick]);

  const current = result && result.path === path ? result : null;
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data: current?.data ?? null, error: current?.error ?? null, loading: !!path && !current, reload };
}
