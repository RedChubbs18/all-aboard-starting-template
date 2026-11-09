/**
 * In-memory sliding-window rate limiter (per server process; fine for the local demo).
 * Used by the chat route, the photo check and failed demo PIN attempts.
 */
export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export interface RateLimiter {
  readonly max: number;
  readonly windowMs: number;
  take(key: string, now?: number): RateLimitResult;
  /** Like take, but does not record a hit. */
  peek(key: string, now?: number): RateLimitResult;
  reset(): void;
}

export function createRateLimiter(opts: { max: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  const peek = (key: string, now: number): RateLimitResult => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
    hits.set(key, recent);
    return recent.length >= opts.max
      ? { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + opts.windowMs - now) / 1000)) }
      : { ok: true };
  };
  return {
    max: opts.max,
    windowMs: opts.windowMs,
    take(key, now = Date.now()) {
      const r = peek(key, now);
      if (r.ok) hits.get(key)!.push(now);
      return r;
    },
    peek: (key, now = Date.now()) => peek(key, now),
    reset() {
      hits.clear();
    },
  };
}
