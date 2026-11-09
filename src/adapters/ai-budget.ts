/**
 * Global daily cap on Claude calls, shared by the chatbot and photo check adapters, so a runaway client
 * or a leaked session cannot burn the shared event budget. Per server process, reset at UTC midnight.
 * Over the cap the adapters use their safe fallback (chat: contact P&P; photo: pending manual review).
 *
 * Configure with AI_DAILY_CALL_CAP (default 300). 0 disables Claude calls entirely.
 */
export const DEFAULT_AI_DAILY_CALL_CAP = 300;

const g = globalThis as unknown as { __aiBudget?: { day: string; count: number } };

export function aiDailyCallCap(): number {
  const raw = process.env.AI_DAILY_CALL_CAP?.trim();
  if (!raw) return DEFAULT_AI_DAILY_CALL_CAP;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_AI_DAILY_CALL_CAP;
}

/** Reserves one Claude call for today. Returns false (and logs once per day) when the cap is reached. */
export function takeAiCall(now: Date = new Date()): boolean {
  const day = now.toISOString().slice(0, 10);
  if (g.__aiBudget?.day !== day) g.__aiBudget = { day, count: 0 };
  const cap = aiDailyCallCap();
  if (g.__aiBudget.count >= cap) {
    if (g.__aiBudget.count === cap) {
      console.warn(`[ai-budget] Daily Claude call cap (${cap}) reached; using fallbacks until UTC midnight`);
      g.__aiBudget.count++; // log once
    }
    return false;
  }
  g.__aiBudget.count++;
  return true;
}

/** Tests only. */
export function resetAiBudget() {
  delete g.__aiBudget;
}
