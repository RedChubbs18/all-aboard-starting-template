# On-device vision assets

- `face_landmarker.task`: MediaPipe Face Landmarker (float16), Apache-2.0, from
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
  Committed so the demo works offline.
- `wasm/`: MediaPipe Tasks Vision runtime (Apache-2.0). Not committed; copied from
  `node_modules/@mediapipe/tasks-vision/wasm` by `scripts/copy-vision-assets.mjs` on `postinstall` and `build`.
