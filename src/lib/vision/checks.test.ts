import { describe, expect, it } from "vitest";
import {
  blockingReason,
  coverRegion,
  evaluateChecks,
  eyeRegionVisible,
  eyesOpen,
  facingForward,
  faceCountState,
  framingState,
  laplacianVariance,
  lightState,
  meanLuma,
  poseFromMatrix,
  summarise,
  type FrameAnalysis,
  type Gray,
  type Pt,
} from "./checks";
import { createGate } from "./gate";

const FULL = { x: 0, y: 0, w: 1, h: 1 };
const deg = (d: number) => (d * Math.PI) / 180;

/** A face whose landmark bounding box is `w` wide and 1.3w tall around (cx, cy). */
function face(w: number, cx = 0.5, cy = 0.5): Pt[] {
  const pts: Pt[] = Array.from({ length: 478 }, () => ({ x: cx, y: cy }));
  pts[0] = { x: cx - w / 2, y: cy - w * 0.65 };
  pts[1] = { x: cx + w / 2, y: cy + w * 0.65 };
  return pts;
}

const rotY = (d: number) => [Math.cos(deg(d)), 0, -Math.sin(deg(d)), 0, 0, 1, 0, 0, Math.sin(deg(d)), 0, Math.cos(deg(d)), 0, 0, 0, 0, 1];
const rotX = (d: number) => [1, 0, 0, 0, 0, Math.cos(deg(d)), Math.sin(deg(d)), 0, 0, -Math.sin(deg(d)), Math.cos(deg(d)), 0, 0, 0, 0, 1];
const rotZ = (d: number) => [Math.cos(deg(d)), Math.sin(deg(d)), 0, 0, -Math.sin(deg(d)), Math.cos(deg(d)), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const flat = (v: number, n = 16): Gray => ({ data: new Uint8Array(n * n).fill(v), width: n, height: n });
const checker = (lo: number, hi: number, n = 16): Gray => ({
  data: Uint8Array.from({ length: n * n }, (_, i) => ((i % n) + Math.floor(i / n)) % 2 ? hi : lo),
  width: n,
  height: n,
});

describe("face count", () => {
  it("classifies none, one and many", () => {
    expect(faceCountState(0)).toBe("none");
    expect(faceCountState(1)).toBe("one");
    expect(faceCountState(2)).toBe("many");
  });
});

describe("framing", () => {
  it("accepts a centred face of about half the frame width", () => {
    expect(framingState(face(0.5), FULL)).toBe("ok");
  });
  it("asks to move closer or back by width", () => {
    expect(framingState(face(0.2), FULL)).toBe("closer");
    expect(framingState(face(0.8), FULL)).toBe("back");
  });
  it("asks to centre when off to the side", () => {
    expect(framingState(face(0.45, 0.75), FULL)).toBe("centre");
    expect(framingState(face(0.45, 0.5, 0.8), FULL)).toBe("centre");
  });
  it("measures against the visible part of a cropped video", () => {
    // A wide box over a 4:3 video shows the full width, so the same face still passes.
    const region = coverRegion(1280, 960, 800, 380);
    expect(region.w).toBe(1);
    expect(region.h).toBeCloseTo(1280 / 960 / (800 / 380), 5);
    // A tall box crops the sides: a face 0.4 of the video width fills more of what is visible.
    const tall = coverRegion(1280, 960, 300, 600);
    expect(tall.w).toBeCloseTo(0.375, 3);
    expect(framingState(face(0.2), tall)).toBe("ok");
  });
});

describe("pose from the transformation matrix", () => {
  it("reads yaw, pitch and roll in degrees", () => {
    expect(poseFromMatrix(rotY(10))!.yaw).toBeCloseTo(10, 5);
    expect(poseFromMatrix(rotX(-8))!.pitch).toBeCloseTo(-8, 5);
    expect(poseFromMatrix(rotZ(5))!.roll).toBeCloseTo(5, 5);
  });
  it("ignores uniform scale", () => {
    const scaled = rotY(10).map((v, i) => (i % 4 === 3 ? v : v * 7));
    expect(poseFromMatrix(scaled)!.yaw).toBeCloseTo(10, 5);
  });
  it("allows up to 12 degrees and rejects more", () => {
    expect(facingForward(rotY(0))).toBe(true);
    expect(facingForward(rotY(11))).toBe(true);
    expect(facingForward(rotY(15))).toBe(false);
    expect(facingForward(rotX(15))).toBe(false);
    expect(facingForward(rotZ(-20))).toBe(false);
    expect(facingForward(undefined)).toBe(false);
  });
});

describe("eyes", () => {
  it("uses the blink blendshapes", () => {
    expect(eyesOpen({ eyeBlinkLeft: 0.05, eyeBlinkRight: 0.1 })).toBe(true);
    expect(eyesOpen({ eyeBlinkLeft: 0.8, eyeBlinkRight: 0.1 })).toBe(false);
    expect(eyesOpen({ eyeBlinkLeft: 0.1 })).toBe(false);
    expect(eyesOpen(undefined)).toBe(false);
  });
  it("treats low-contrast eye regions as dark glass", () => {
    expect(eyeRegionVisible({ left: checker(60, 160), right: checker(50, 150) })).toBe(true);
    expect(eyeRegionVisible({ left: flat(20), right: checker(50, 150) })).toBe(false);
    expect(eyeRegionVisible(undefined)).toBe(false);
  });
});

describe("light", () => {
  it("computes mean luma", () => {
    expect(meanLuma(flat(100))).toBe(100);
  });
  it("flags dark, bright and uneven light", () => {
    expect(lightState(flat(30))).toBe("dark");
    expect(lightState(flat(240))).toBe("bright");
    expect(lightState(flat(130))).toBe("ok");
    const n = 16;
    const half: Gray = { data: Uint8Array.from({ length: n * n }, (_, i) => ((i % n) < n / 2 ? 70 : 200)), width: n, height: n };
    expect(lightState(half)).toBe("uneven");
  });
});

describe("sharpness (variance of the Laplacian)", () => {
  it("is zero on a flat image and large on a sharp one", () => {
    expect(laplacianVariance(flat(120))).toBe(0);
    expect(laplacianVariance(checker(40, 200))).toBeGreaterThan(1000);
  });
  it("is lower for a blurred image than for the same image sharp", () => {
    const n = 16;
    const sharp = Uint8Array.from({ length: n * n }, (_, i) => ((i % n) < n / 2 ? 40 : 200));
    const blur = Uint8Array.from({ length: n * n }, (_, i) => 40 + (160 * Math.min(n, Math.max(0, (i % n) - 4))) / 8 / 1);
    const blurClamped = Uint8Array.from(blur, (v) => Math.min(200, v));
    expect(laplacianVariance({ data: sharp, width: n, height: n })).toBeGreaterThan(laplacianVariance({ data: blurClamped, width: n, height: n }));
  });
});

describe("evaluateChecks", () => {
  const good = (): FrameAnalysis => ({
    faceCount: 1,
    face: face(0.5),
    matrix: rotY(2),
    blendshapes: { eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 },
    view: FULL,
    pixels: { face: checker(80, 180), eyes: { left: checker(50, 150), right: checker(50, 150) } },
  });
  it("passes everything for a good frame", () => {
    const r = evaluateChecks(good());
    expect(r.every((c) => c.passed)).toBe(true);
    expect(blockingReason(r)).toBeNull();
  });
  it("asks for one face when several are visible", () => {
    const r = evaluateChecks({ ...good(), faceCount: 2 });
    expect(blockingReason(r)).toBe("Make sure only you are in the frame");
  });
  it("reports no face", () => {
    const r = evaluateChecks({ faceCount: 0, view: FULL });
    expect(r.every((c) => !c.passed)).toBe(true);
    expect(blockingReason(r)).toMatch(/can't see your face/);
  });
  it("gives the first failing check's guidance", () => {
    expect(blockingReason(evaluateChecks({ ...good(), face: face(0.2) }))).toBe("Move closer");
    expect(blockingReason(evaluateChecks({ ...good(), matrix: rotY(25) }))).toBe("Look straight at the camera");
    expect(blockingReason(evaluateChecks({ ...good(), pixels: { ...good().pixels!, face: flat(30) } }))).toBe("Find more light");
    expect(blockingReason(evaluateChecks({ ...good(), pixels: { ...good().pixels!, face: flat(120) } }))).toBe("Hold still");
    expect(blockingReason(evaluateChecks({ ...good(), blendshapes: { eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 } }))).toMatch(/Open your eyes/);
    expect(
      blockingReason(evaluateChecks({ ...good(), pixels: { ...good().pixels!, eyes: { left: flat(10), right: flat(10) } } })),
    ).toMatch(/sunglasses/);
  });
  it("summarises without image data", () => {
    const s = summarise(evaluateChecks({ ...good(), faceCount: 2 }), true);
    expect(s).toEqual({ version: 1, available: true, passed: expect.any(Array), failed: ["oneFace"] });
  });
});

describe("gate hysteresis", () => {
  it("opens only after 500ms of continuous passing", () => {
    const g = createGate();
    expect(g.update(true, 0)).toBe(false);
    expect(g.update(true, 499)).toBe(false);
    expect(g.update(true, 500)).toBe(true);
    expect(g.update(true, 900)).toBe(true);
  });
  it("restarts the clock when a check fails", () => {
    const g = createGate();
    g.update(true, 0);
    g.update(true, 400);
    expect(g.update(false, 450)).toBe(false);
    expect(g.update(true, 500)).toBe(false);
    expect(g.update(true, 900)).toBe(false);
    expect(g.update(true, 1000)).toBe(true);
  });
  it("closes again as soon as a check fails", () => {
    const g = createGate();
    g.update(true, 0);
    expect(g.update(true, 600)).toBe(true);
    expect(g.update(false, 700)).toBe(false);
  });
});
