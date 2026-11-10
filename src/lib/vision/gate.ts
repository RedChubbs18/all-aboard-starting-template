/** Hysteresis for the capture button: every check must pass continuously for `holdMs` before it enables. */
export const HOLD_MS = 500;

export interface Gate {
  /** Feed the latest "all checks pass" value with a timestamp in ms. Returns whether capture is allowed. */
  update(allPass: boolean, now: number): boolean;
  reset(): void;
}

export function createGate(holdMs: number = HOLD_MS): Gate {
  let since: number | null = null;
  let open = false;
  return {
    update(allPass, now) {
      if (!allPass) {
        since = null;
        open = false;
        return false;
      }
      since ??= now;
      if (now - since >= holdMs) open = true;
      return open;
    },
    reset() {
      since = null;
      open = false;
    },
  };
}
