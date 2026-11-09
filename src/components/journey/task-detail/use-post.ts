"use client";

import { useCallback, useState } from "react";
import { useSession } from "@/lib/auth/client";

export interface PostResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
}

/** POST JSON (or FormData) to a role-guarded route with the session's credentials. */
export function usePost() {
  const { apiFetch } = useSession();
  const [busy, setBusy] = useState(false);
  const post = useCallback(
    async <T = Record<string, unknown>>(path: string, body: unknown): Promise<PostResult<T>> => {
      setBusy(true);
      try {
        const isForm = typeof FormData !== "undefined" && body instanceof FormData;
        const r = await apiFetch(path, {
          method: "POST",
          headers: isForm ? undefined : { "content-type": "application/json" },
          body: isForm ? (body as FormData) : JSON.stringify(body),
        });
        const json = (await r.json().catch(() => ({}))) as T & { message?: string };
        if (!r.ok) return { ok: false, status: r.status, error: json.message ?? "Something went wrong. Please try again." };
        return { ok: true, status: r.status, data: json };
      } catch {
        return { ok: false, status: 0, error: "We couldn't reach the server. Check your connection and try again." };
      } finally {
        setBusy(false);
      }
    },
    [apiFetch],
  );
  return { post, busy };
}
