/**
 * Track geometry for the horse hero. The path, the milestones and the horse all come from the
 * same function, so art and maths cannot drift (design/journey-track.md section 2). Pure and
 * DOM-free: no getPointAtLength, so it works in tests and during server rendering.
 */
export const VIEW_W = 360;
export const VIEW_H = 120;
export const X0 = 28;
export const X1 = 328;
const AMPLITUDE = 22;
const BASE_Y = 66;
const PERIOD = 240;

export interface TrackPoint {
  x: number;
  y: number;
  /** Tangent angle in degrees, clamped to +/- 12 so the horse never looks like it is falling. */
  angle: number;
}

const rawY = (x: number) => BASE_Y - AMPLITUDE * Math.sin((2 * Math.PI * (x - X0)) / PERIOD);

/** progress 0..1 along the track. */
export function pointAt(progress: number): TrackPoint {
  const p = Math.max(0, Math.min(1, progress));
  const x = X0 + (X1 - X0) * p;
  const slope = -AMPLITUDE * ((2 * Math.PI) / PERIOD) * Math.cos((2 * Math.PI * (x - X0)) / PERIOD);
  const deg = (Math.atan(slope) * 180) / Math.PI;
  return { x, y: rawY(x), angle: Math.max(-12, Math.min(12, deg)) };
}

/** Milestone flag k (1..5) sits at k/5 of the track. */
export const milestonePoint = (k: number) => pointAt(k / 5);

/** SVG path data sampled every 5 units. */
export function trackPathD(): string {
  const pts: string[] = [];
  for (let x = X0; x <= X1; x += 5) pts.push(`${pts.length ? "L" : "M"}${x} ${rawY(x).toFixed(1)}`);
  return pts.join(" ");
}

/** Progress at which the milestone count crosses a boundary (used to trigger the celebration). */
export const milestonesReached = (progress: number) => Math.floor(progress * 5 + 1e-9);
