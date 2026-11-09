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
  /**
   * Set when the automated check could not run (AI unavailable, refusal, error). The result is
   * then issue-free so the starter is not blocked, and a line manager or P&P should review and recertify the photo manually (D12).
   */
  needsManualReview?: boolean;
}

/** FR-3.12: sunglasses, hats, unclear face. Submission is blocked until pass or a P&P override. */
export interface PhotoCheckAdapter extends BaseAdapter {
  key: "photocheck";
  check(input: PhotoCheckInput): Promise<PhotoCheckResult>;
}
