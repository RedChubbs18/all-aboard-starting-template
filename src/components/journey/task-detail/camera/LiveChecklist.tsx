"use client";

import { useEffect, useState } from "react";
import { Tick } from "@/components/ui/Tick";
import { ORDER, LABELS } from "@/lib/vision/checks";
import type { LiveChecks } from "./use-live-checks";

/** Only announce once the blocking reason has been stable this long, so the screen reader is not chatty. */
const ANNOUNCE_DEBOUNCE_MS = 1200;

export const UNAVAILABLE_TEXT = "Live checks aren't available on this device. You can still take a photo; it will be checked after you take it.";

/** The announcement for the current state, or "" while there is nothing useful to say. */
function message(live: LiveChecks, countdown: number | null): string {
  if (live.status !== "running") return "";
  if (countdown !== null) return "";
  return live.ready ? "All checks passed. You can take your photo." : (live.reason ?? "");
}

/**
 * Live photo-check list under the viewfinder (STYLE 15: dot plus text). Met is a filled dot with a tick,
 * pending is an empty ring, and each row also carries "Met"/"Not yet" for screen readers, so colour is never the only cue.
 */
export function LiveChecklist({ live, countdown }: { live: LiveChecks; countdown: number | null }) {
  const target = message(live, countdown);
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setAnnounced(target), target ? ANNOUNCE_DEBOUNCE_MS : 0);
    return () => clearTimeout(t);
  }, [target]);

  return (
    <section aria-labelledby="live-checks-title" className="mt-3 rounded-md border border-line bg-card">
      <h2 id="live-checks-title" className="px-4 pt-3 font-bold">
        Live photo checks
      </h2>
      <p role="status" className="sr-only">
        {countdown !== null ? `Taking your photo in ${countdown}` : announced}
      </p>
      {live.status === "loading" && <p className="px-4 py-2.5 text-sm text-muted">Starting live checks...</p>}
      {live.status === "unavailable" && <p className="px-4 py-2.5 text-sm">{UNAVAILABLE_TEXT}</p>}
      {live.status === "running" && (
        <ul className="mt-1">
          {ORDER.map((id) => {
            const r = live.results.find((x) => x.id === id);
            const passed = !!r?.passed;
            return (
              <li key={id} className="flex items-start gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
                <Tick status={passed ? "DONE" : "TODO"} size={20} className="mt-0.5" />
                <span className="sr-only">{passed ? "Met: " : "Not yet: "}</span>
                <span>
                  {LABELS[id]}
                  {!passed && r?.hint && <span className="block text-sm text-muted">{r.hint}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {live.status !== "unavailable" && (
        <p className="border-t border-line px-4 py-2.5 text-sm text-muted">
          No hats or head coverings, and clear eyes: we also check these after you take the photo.
        </p>
      )}
    </section>
  );
}
