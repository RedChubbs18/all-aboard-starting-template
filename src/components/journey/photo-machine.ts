/**
 * Photo ID pass flow (FR-3.11 / FR-3.12) as a pure state machine, so reject-then-pass is unit tested
 * without the DOM. The image itself never lives here: only file name, issues and the opaque reference.
 */
export type PhotoState =
  | { step: "idle"; attempts: number; notice?: string }
  | { step: "checking"; attempts: number; fileName: string }
  | { step: "rejected"; attempts: number; fileName: string; issues: string[]; reviewRequested: boolean }
  | { step: "passed"; attempts: number; fileName: string; photoRef: string; token: string }
  | { step: "submitting"; attempts: number; fileName: string; photoRef: string; token: string }
  | { step: "submitted"; attempts: number; orderRef: string; location: string }
  | { step: "error"; attempts: number; message: string; fileName?: string };

export type PhotoEvent =
  | { type: "SELECT"; fileName: string }
  | { type: "INVALID_FILE"; message: string }
  | { type: "REJECTED"; issues: string[] }
  | { type: "PASSED"; photoRef: string; token: string }
  | { type: "CHECK_FAILED"; message: string }
  | { type: "REVIEW_REQUESTED" }
  | { type: "RETRY" }
  | { type: "SUBMIT" }
  | { type: "SUBMITTED"; orderRef: string; location: string }
  | { type: "SUBMIT_FAILED"; message: string };

export const initialPhotoState: PhotoState = { step: "idle", attempts: 0 };

export function photoReducer(s: PhotoState, e: PhotoEvent): PhotoState {
  switch (e.type) {
    case "SELECT":
      // A new photo can be chosen from any step except mid-check or mid-submit.
      if (s.step === "checking" || s.step === "submitting" || s.step === "submitted") return s;
      return { step: "checking", attempts: s.attempts + 1, fileName: e.fileName };
    case "INVALID_FILE":
      if (s.step === "checking" || s.step === "submitting" || s.step === "submitted") return s;
      return { step: "idle", attempts: s.attempts, notice: e.message };
    case "REJECTED":
      return s.step === "checking" ? { step: "rejected", attempts: s.attempts, fileName: s.fileName, issues: e.issues, reviewRequested: false } : s;
    case "PASSED":
      return s.step === "checking" ? { step: "passed", attempts: s.attempts, fileName: s.fileName, photoRef: e.photoRef, token: e.token } : s;
    case "CHECK_FAILED":
      return s.step === "checking" ? { step: "error", attempts: s.attempts, message: e.message, fileName: s.fileName } : s;
    case "REVIEW_REQUESTED":
      return s.step === "rejected" ? { ...s, reviewRequested: true } : s;
    case "RETRY":
      return s.step === "rejected" || s.step === "error" || s.step === "passed" ? { step: "idle", attempts: s.attempts } : s;
    case "SUBMIT":
      return s.step === "passed" ? { ...s, step: "submitting" } : s;
    case "SUBMITTED":
      return s.step === "submitting" ? { step: "submitted", attempts: s.attempts, orderRef: e.orderRef, location: e.location } : s;
    case "SUBMIT_FAILED":
      return s.step === "submitting"
        ? { step: "passed", attempts: s.attempts, fileName: s.fileName, photoRef: s.photoRef, token: s.token }
        : s;
  }
}

/** Submit is possible only after a pass. */
export const canSubmitPhoto = (s: PhotoState) => s.step === "passed";

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Client-side file validation (the server re-checks). */
export function validatePhotoFile(f: { type: string; size: number }): string | null {
  if (!f.type.startsWith("image/")) return "Please choose an image file (JPEG or PNG).";
  if (f.size > PHOTO_MAX_BYTES) return "That photo is over 5 MB. Please choose a smaller one.";
  return null;
}
