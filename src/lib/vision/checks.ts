/**
 * Pure, DOM-free photo checks (D28). Everything here is a heuristic that runs on the user's device to give
 * live guidance. The server-side check (Claude) is AUTHORITATIVE: these checks only decide when the capture
 * button enables, and they never decide whether a pass photo is accepted.
 * All coordinates are normalised (0..1) in VIDEO-frame space unless stated otherwise.
 */

export interface Pt {
  x: number;
  y: number;
  z?: number;
}

/** The part of the (object-fit: cover) video that is actually visible, in normalised video coordinates. */
export interface ViewRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Grayscale image, row-major, values 0..255. */
export interface Gray {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

export type CheckId = "oneFace" | "framing" | "forward" | "eyes" | "light" | "sharp";

export interface CheckResult {
  id: CheckId;
  label: string;
  passed: boolean;
  /** Friendly guidance, shown while the check is failing. */
  hint: string;
}

export const THRESHOLDS = {
  /** Face width as a fraction of the visible frame width. */
  faceWidthMin: 0.35,
  faceWidthMax: 0.65,
  /** Face centre must sit inside the oval scaled by this factor (1 = the full oval). */
  centreTolerance: 0.5,
  /** Max head rotation, in degrees, on each axis. */
  maxAngleDeg: 12,
  /** eyeBlink blendshape score at or above this means the eye is closed. */
  blinkMax: 0.5,
  /** Std deviation of luma in an eye box below this looks like dark glass (or a closed eye). */
  eyeContrastMin: 18,
  /** Mean face luma range (0..255). */
  lumaMin: 70,
  lumaMax: 205,
  /** |left - right| / mean luma above this is uneven light. */
  unevenMax: 0.3,
  /** Variance of the Laplacian on a 96px face crop below this is blurry. Tune on real webcams. */
  sharpnessMin: 40,
} as const;

/** The oval guide, as a fraction of the visible region: matches the CSS (48% wide, 70% tall, centred). */
export const GUIDE = { w: 0.48, h: 0.7 } as const;

export const LABELS: Record<CheckId, string> = {
  oneFace: "Only you in the frame",
  framing: "Face centred and the right size",
  forward: "Looking straight at the camera",
  eyes: "Eyes clearly visible (no sunglasses)",
  light: "Even, good light",
  sharp: "Sharp and steady",
};

export const ORDER: CheckId[] = ["oneFace", "framing", "forward", "eyes", "light", "sharp"];

const rad2deg = (r: number) => (r * 180) / Math.PI;

export function boundingBox(pts: readonly Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Which part of a video is visible when it is shown with object-fit: cover in a box of the given size. */
export function coverRegion(videoW: number, videoH: number, boxW: number, boxH: number): ViewRegion {
  if (!videoW || !videoH || !boxW || !boxH) return { x: 0, y: 0, w: 1, h: 1 };
  const videoAspect = videoW / videoH;
  const boxAspect = boxW / boxH;
  if (boxAspect > videoAspect) return { x: 0, y: (1 - videoAspect / boxAspect) / 2, w: 1, h: videoAspect / boxAspect };
  return { x: (1 - boxAspect / videoAspect) / 2, y: 0, w: boxAspect / videoAspect, h: 1 };
}

export type FaceCountState = "none" | "one" | "many";
export const faceCountState = (count: number): FaceCountState => (count === 0 ? "none" : count === 1 ? "one" : "many");

export type FramingState = "ok" | "closer" | "back" | "centre";

/**
 * Size first (move closer/back), then position. Width is measured against the visible frame width, so the
 * advice matches what the user sees. The face must also lie fully inside the visible frame.
 */
export function framingState(face: readonly Pt[], view: ViewRegion): FramingState {
  const b = boundingBox(face);
  const widthFrac = (b.maxX - b.minX) / view.w;
  if (widthFrac < THRESHOLDS.faceWidthMin) return "closer";
  if (widthFrac > THRESHOLDS.faceWidthMax) return "back";
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const rx = (GUIDE.w / 2) * view.w * THRESHOLDS.centreTolerance * 2;
  const ry = (GUIDE.h / 2) * view.h * THRESHOLDS.centreTolerance * 2;
  const dx = (cx - (view.x + view.w / 2)) / rx;
  const dy = (cy - (view.y + view.h / 2)) / ry;
  const inside = b.minX >= view.x && b.maxX <= view.x + view.w && b.minY >= view.y && b.maxY <= view.y + view.h;
  return dx * dx + dy * dy <= 1 && inside ? "ok" : "centre";
}

/**
 * Head pose in degrees from MediaPipe's 4x4 facial transformation matrix (column-major, may include scale).
 * Mirroring does not matter: callers compare absolute values.
 */
export function poseFromMatrix(m: ArrayLike<number>): { yaw: number; pitch: number; roll: number } | null {
  if (m.length < 16) return null;
  const col = (c: number) => {
    const n = Math.hypot(m[c * 4]!, m[c * 4 + 1]!, m[c * 4 + 2]!) || 1;
    return [m[c * 4]! / n, m[c * 4 + 1]! / n, m[c * 4 + 2]! / n] as const;
  };
  const c0 = col(0);
  const c1 = col(1);
  const c2 = col(2);
  // R[row][col]
  const r20 = c0[2];
  const r21 = c1[2];
  const r22 = c2[2];
  const r10 = c0[1];
  const r00 = c0[0];
  return {
    yaw: rad2deg(Math.asin(Math.max(-1, Math.min(1, -r20)))),
    pitch: rad2deg(Math.atan2(r21, r22)),
    roll: rad2deg(Math.atan2(r10, r00)),
  };
}

export function facingForward(m: ArrayLike<number> | undefined): boolean {
  const pose = m ? poseFromMatrix(m) : null;
  if (!pose) return false;
  const max = THRESHOLDS.maxAngleDeg;
  return Math.abs(pose.yaw) <= max && Math.abs(pose.pitch) <= max && Math.abs(pose.roll) <= max;
}

/** Both eyes open, judged by the eyeBlinkLeft / eyeBlinkRight blendshape scores (0 open .. 1 closed). */
export function eyesOpen(blend: Readonly<Record<string, number>> | undefined): boolean {
  if (!blend) return false;
  const l = blend.eyeBlinkLeft;
  const r = blend.eyeBlinkRight;
  return l !== undefined && r !== undefined && l < THRESHOLDS.blinkMax && r < THRESHOLDS.blinkMax;
}

export function meanLuma(g: Gray): number {
  let sum = 0;
  const n = g.width * g.height;
  for (let i = 0; i < n; i++) sum += g.data[i]!;
  return n ? sum / n : 0;
}

export function stdDev(g: Gray): number {
  const n = g.width * g.height;
  if (!n) return 0;
  const mean = meanLuma(g);
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (g.data[i]! - mean) ** 2;
  return Math.sqrt(acc / n);
}

/** Mean luma of the left and right halves of a grayscale crop. */
export function halvesLuma(g: Gray): { left: number; right: number } {
  const half = Math.floor(g.width / 2);
  let l = 0;
  let r = 0;
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < half; x++) {
      l += g.data[y * g.width + x]!;
      r += g.data[y * g.width + (g.width - 1 - x)]!;
    }
  }
  const n = half * g.height || 1;
  return { left: l / n, right: r / n };
}

export type LightState = "ok" | "dark" | "bright" | "uneven";

export function lightState(g: Gray): LightState {
  const mean = meanLuma(g);
  if (mean < THRESHOLDS.lumaMin) return "dark";
  if (mean > THRESHOLDS.lumaMax) return "bright";
  const { left, right } = halvesLuma(g);
  return Math.abs(left - right) / mean > THRESHOLDS.unevenMax ? "uneven" : "ok";
}

/** Variance of the 4-neighbour Laplacian: the classic focus measure. Higher is sharper. */
export function laplacianVariance(g: Gray): number {
  const { width: w, height: h, data } = g;
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * data[i]! - data[i - 1]! - data[i + 1]! - data[i - w]! - data[i + w]!;
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * Sunglasses heuristic: dark glass leaves almost no texture in the eye region (no sclera/iris/skin contrast).
 * This is a hint only: reflective or light-tinted lenses will pass, and it cannot tell glasses from closed eyes.
 * The server check is authoritative for sunglasses.
 */
export function eyeRegionVisible(eyes: { left: Gray; right: Gray } | undefined): boolean {
  if (!eyes) return false;
  return stdDev(eyes.left) >= THRESHOLDS.eyeContrastMin && stdDev(eyes.right) >= THRESHOLDS.eyeContrastMin;
}

/** What one frame of analysis produced. `pixels` are undefined when the frame could not be sampled. */
export interface FrameAnalysis {
  faceCount: number;
  face?: readonly Pt[];
  matrix?: ArrayLike<number>;
  blendshapes?: Readonly<Record<string, number>>;
  view: ViewRegion;
  pixels?: { face: Gray; eyes: { left: Gray; right: Gray } };
}

const mk = (id: CheckId, passed: boolean, hint: string): CheckResult => ({ id, label: LABELS[id], passed, hint });

/** Turns one frame's analysis into the six live checks, with friendly guidance for each failure. */
export function evaluateChecks(f: FrameAnalysis): CheckResult[] {
  const count = faceCountState(f.faceCount);
  if (count === "none" || !f.face) {
    const wait = "Waiting for your face";
    return [
      mk("oneFace", false, "We can't see your face. Line it up with the oval"),
      mk("framing", false, wait),
      mk("forward", false, wait),
      mk("eyes", false, wait),
      mk("light", false, wait),
      mk("sharp", false, wait),
    ];
  }
  const framing = framingState(f.face, f.view);
  const framingHint = { ok: "", closer: "Move closer", back: "Move back", centre: "Centre your face in the oval" }[framing];
  const light = f.pixels ? lightState(f.pixels.face) : "ok";
  const lightHint = { ok: "", dark: "Find more light", bright: "Too bright. Find softer light", uneven: "Find more even light" }[light];
  const blinkOk = eyesOpen(f.blendshapes);
  const eyesVisible = f.pixels ? eyeRegionVisible(f.pixels.eyes) : true;
  const sharpOk = f.pixels ? laplacianVariance(f.pixels.face) >= THRESHOLDS.sharpnessMin : false;
  return [
    mk("oneFace", count === "one", count === "one" ? "" : "Make sure only you are in the frame"),
    mk("framing", framing === "ok", framingHint),
    mk("forward", facingForward(f.matrix), "Look straight at the camera"),
    mk("eyes", blinkOk && eyesVisible, !blinkOk ? "Open your eyes and look at the camera" : "Take off sunglasses so your eyes are clearly visible"),
    mk("light", light === "ok", lightHint),
    mk("sharp", sharpOk, "Hold still"),
  ];
}

/** The first failing check's guidance, or null when everything passes. */
export function blockingReason(results: readonly CheckResult[]): string | null {
  return results.find((r) => !r.passed)?.hint ?? null;
}

/** Small, non-identifying summary sent to the server as optional metadata. */
export interface LocalCheckSummary {
  version: 1;
  available: boolean;
  passed: CheckId[];
  failed: CheckId[];
}

export function summarise(results: readonly CheckResult[], available: boolean): LocalCheckSummary {
  return {
    version: 1,
    available,
    passed: results.filter((r) => r.passed).map((r) => r.id),
    failed: results.filter((r) => !r.passed).map((r) => r.id),
  };
}
