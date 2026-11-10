/**
 * D39: fire-and-forget trigger used by journey-service when a journey reaches UNCONDITIONAL_OFFER. Kept separate (and
 * importing identity-conversion lazily) so journey-service does not import the conversion module (circular).
 * Never throws and never blocks the request that advanced the stage.
 */
const DELAY_MS = 750; // lets the advancing transaction commit before the job reads the journey

export function enqueueConversion(journeyId: string): void {
  // Tests opt in explicitly; otherwise stray timers would touch the database after a test file finishes.
  if (process.env.VITEST && !process.env.CONVERSION_ENQUEUE_IN_TESTS) return;
  // Demo staging (npm run demo:prepare) writes with its own member test accounts and must never start a conversion.
  if (process.env.CONVERSION_ENQUEUE_DISABLED === "1") return;
  try {
    const t = setTimeout(() => {
      void import("./identity-conversion")
        .then((m) => m.convertStarterToMember(journeyId, { trigger: "stage" }))
        .catch((e) => console.error("[identity-conversion] job failed:", e instanceof Error ? e.name : "error"));
    }, DELAY_MS);
    t.unref?.();
  } catch {
    /* never block the caller */
  }
}
