import type { BaseAdapter } from "../types";

export interface PhotoCheckInput {
  /** Raw image bytes (real adapter) and/or the file name (mock keys off it for demos). */
  image?: Uint8Array;
  fileName?: string;
  mimeType?: string;
}

export interface PhotoCheckResult {
  pass: boolean;
  issues: string[];
}

/** FR-3.12: sunglasses, hats, unclear face. Submission is blocked until pass or a P&P override. */
export interface PhotoCheckAdapter extends BaseAdapter {
  key: "photocheck";
  check(input: PhotoCheckInput): Promise<PhotoCheckResult>;
}
