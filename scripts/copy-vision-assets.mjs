// Copies the MediaPipe Tasks Vision WASM runtime from node_modules into public/vision/wasm so the
// on-device photo checks load everything from our own origin (no CDN, no network at runtime).
// The model (public/vision/face_landmarker.task, Apache-2.0) is committed. Runs on postinstall and build.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = join(root, "public", "vision", "wasm");

if (!existsSync(from)) {
  console.warn("copy-vision-assets: @mediapipe/tasks-vision not installed; skipping (live photo checks will fall back).");
} else {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log("copy-vision-assets: copied MediaPipe WASM to public/vision/wasm");
}
