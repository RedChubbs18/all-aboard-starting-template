"use client";

import { useEffect, useState, type RefObject } from "react";
import { blockingReason, coverRegion, evaluateChecks, type CheckResult } from "@/lib/vision/checks";
import { createGate } from "@/lib/vision/gate";
import { loadLandmarker, type Landmarker } from "@/lib/vision/landmarker";
import { readFacePixels } from "@/lib/vision/pixels";

export type LiveStatus = "loading" | "running" | "unavailable";

export interface LiveChecks {
  status: LiveStatus;
  results: CheckResult[];
  /** Every check has passed continuously for the hold time. */
  ready: boolean;
  /** Why capture is blocked right now (null when ready or while unavailable). */
  reason: string | null;
}

const INITIAL: LiveChecks = { status: "loading", results: [], ready: false, reason: null };

/** About 12 fps. */
const FRAME_MS = 80;
/** Give up on loading the model/WASM after this long. */
const LOAD_TIMEOUT_MS = 20_000;
/** If detection averages slower than this over a window, the device is too slow for live guidance. */
const SLOW_AVG_MS = 250;
const SLOW_WINDOW = 15;

/**
 * Runs the on-device face checks on the live video while `active`. Releases the landmarker and stops the
 * loop when `active` turns false or on unmount. Any failure (WASM, WebGL, model, slow device) ends in
 * status "unavailable", and the caller then allows capture (the server check still gates the pass).
 */
export function useLiveChecks(videoRef: RefObject<HTMLVideoElement | null>, active: boolean): LiveChecks {
  const [state, setState] = useState<LiveChecks>(INITIAL);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let raf = 0;
    let lm: Landmarker | null = null;
    let sig = "";
    let last = -Infinity;
    const durations: number[] = [];
    const gate = createGate();

    const fail = () => {
      if (cancelled) return;
      cancelled = true;
      cancelAnimationFrame(raf);
      lm?.close();
      lm = null;
      setState({ status: "unavailable", results: [], ready: false, reason: null });
    };
    const loadTimer = setTimeout(() => !lm && fail(), LOAD_TIMEOUT_MS);

    const tick = (now: number) => {
      if (cancelled) return;
      raf = requestAnimationFrame(tick);
      const video = videoRef.current;
      if (!lm || !video || video.readyState < 2 || document.hidden || now - last < FRAME_MS) return;
      last = now;
      try {
        const t0 = performance.now();
        const frame = lm.detect(video, now);
        const face = frame.faces.length === 1 ? frame.faces[0] : undefined;
        const results = evaluateChecks({
          faceCount: frame.faces.length,
          face: frame.faces[0],
          matrix: frame.matrix,
          blendshapes: frame.blendshapes,
          view: coverRegion(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight),
          pixels: face ? (readFacePixels(video, face) ?? undefined) : undefined,
        });
        durations.push(performance.now() - t0);
        if (durations.length > SLOW_WINDOW) durations.shift();
        if (durations.length === SLOW_WINDOW && durations.reduce((a, b) => a + b, 0) / SLOW_WINDOW > SLOW_AVG_MS) return fail();
        const ready = gate.update(results.every((r) => r.passed), now);
        const next = results.map((r) => `${r.id}:${r.passed ? 1 : 0}:${r.hint}`).join("|") + (ready ? "#ready" : "");
        if (next !== sig) {
          sig = next;
          setState({ status: "running", results, ready, reason: ready ? null : blockingReason(results) });
        }
      } catch {
        fail();
      }
    };

    loadLandmarker().then(
      (l) => {
        if (cancelled) return l.close();
        lm = l;
        clearTimeout(loadTimer);
        raf = requestAnimationFrame(tick);
        setState((s) => ({ ...s, status: "running" }));
      },
      fail,
    );

    return () => {
      cancelled = true;
      clearTimeout(loadTimer);
      cancelAnimationFrame(raf);
      lm?.close();
      lm = null;
      setState(INITIAL);
    };
  }, [active, videoRef]);

  return active ? state : INITIAL;
}
