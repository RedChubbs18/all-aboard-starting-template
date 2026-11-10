import { boundingBox, type Gray, type Pt } from "./checks";

const FACE_SIZE = 96;
// Eye contour landmarks of the MediaPipe 478-point face mesh.
const RIGHT_EYE = [33, 133, 159, 145, 158, 153, 160, 144];
const LEFT_EYE = [362, 263, 386, 374, 385, 380, 387, 373];

let scratch: HTMLCanvasElement | null = null;

/** Draws a normalised crop of the video onto a small canvas and returns it as grayscale. Frames stay in memory only. */
function cropGray(video: HTMLVideoElement, box: { minX: number; minY: number; maxX: number; maxY: number }, outW: number, outH: number): Gray | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  scratch ??= document.createElement("canvas");
  scratch.width = outW;
  scratch.height = outH;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const sx = Math.max(0, box.minX * vw);
  const sy = Math.max(0, box.minY * vh);
  const sw = Math.min(vw - sx, (box.maxX - box.minX) * vw);
  const sh = Math.min(vh - sy, (box.maxY - box.minY) * vh);
  if (sw < 2 || sh < 2) return null;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
  const rgba = ctx.getImageData(0, 0, outW, outH).data;
  const data = new Uint8Array(outW * outH);
  for (let i = 0; i < data.length; i++) data[i] = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
  return { data, width: outW, height: outH };
}

function eyeBox(face: readonly Pt[], idx: number[]) {
  const b = boundingBox(idx.map((i) => face[i]).filter((p): p is Pt => !!p));
  const padX = (b.maxX - b.minX) * 0.15;
  const padY = (b.maxY - b.minY) * 0.3;
  return { minX: b.minX - padX, maxX: b.maxX + padX, minY: b.minY - padY, maxY: b.maxY + padY };
}

/** Face crop (96x96) plus both eye boxes, all grayscale. Null when the frame cannot be sampled. */
export function readFacePixels(video: HTMLVideoElement, face: readonly Pt[]): { face: Gray; eyes: { left: Gray; right: Gray } } | null {
  if (face.length < 468) return null;
  const f = cropGray(video, boundingBox(face), FACE_SIZE, FACE_SIZE);
  const left = cropGray(video, eyeBox(face, LEFT_EYE), 32, 16);
  const right = cropGray(video, eyeBox(face, RIGHT_EYE), 32, 16);
  return f && left && right ? { face: f, eyes: { left, right } } : null;
}
