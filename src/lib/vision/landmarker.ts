import type { Pt } from "./checks";

/** One detection, reduced to what the checks need. */
export interface FaceFrame {
  faces: Pt[][];
  /** Blendshape scores of the first face, by category name. */
  blendshapes?: Record<string, number>;
  /** Facial transformation matrix of the first face (16 floats, column-major). */
  matrix?: ArrayLike<number>;
}

export interface Landmarker {
  detect(video: HTMLVideoElement, timestampMs: number): FaceFrame;
  close(): void;
}

const WASM_PATH = "/vision/wasm";
/**
 * Served from our own origin (committed, Apache-2.0). If it were ever removed, the official source is
 * https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
 */
const MODEL_PATH = "/vision/face_landmarker.task";

/**
 * Loads MediaPipe Face Landmarker lazily (the library is only imported here, on the photo task page).
 * Tries the GPU delegate, then falls back to CPU. Rejects if WASM/WebGL or the model cannot load.
 * Nothing leaves the device: the WASM and model are static files from this origin.
 */
export async function loadLandmarker(): Promise<Landmarker> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  const make = (delegate: "GPU" | "CPU") =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: "VIDEO",
      numFaces: 2,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
  let lm: Awaited<ReturnType<typeof make>>;
  try {
    lm = await make("GPU");
  } catch {
    lm = await make("CPU");
  }
  return {
    detect(video, ts) {
      const r = lm.detectForVideo(video, ts);
      const blend: Record<string, number> = {};
      for (const c of r.faceBlendshapes?.[0]?.categories ?? []) blend[c.categoryName] = c.score;
      return {
        faces: r.faceLandmarks.map((f) => f.map((p) => ({ x: p.x, y: p.y, z: p.z }))),
        blendshapes: r.faceBlendshapes?.[0] ? blend : undefined,
        matrix: r.facialTransformationMatrixes?.[0]?.data,
      };
    },
    close: () => lm.close(),
  };
}
