import { describe, expect, it } from "vitest";
import { canSubmitPhoto, initialPhotoState, photoReducer, validatePhotoFile, type PhotoEvent, type PhotoState } from "./photo-machine";

const run = (events: PhotoEvent[], from: PhotoState = initialPhotoState) => events.reduce(photoReducer, from);

describe("photo flow state machine", () => {
  it("rejects a sunglasses photo, then passes a retry and can submit", () => {
    let s = run([{ type: "SELECT", fileName: "me-sunglasses.jpg" }]);
    expect(s.step).toBe("checking");
    s = run([{ type: "REJECTED", issues: ["Sunglasses are not allowed. Please remove them."] }], s);
    expect(s).toMatchObject({ step: "rejected", attempts: 1 });
    expect(canSubmitPhoto(s)).toBe(false);

    s = run([{ type: "SELECT", fileName: "me.jpg" }], s); // retake straight from the rejected state
    expect(s).toMatchObject({ step: "checking", attempts: 2 });
    s = run([{ type: "PASSED", photoRef: "PH-1", token: "tok" }], s);
    expect(s.step).toBe("passed");
    expect(canSubmitPhoto(s)).toBe(true);

    s = run([{ type: "SUBMIT" }, { type: "SUBMITTED", orderRef: "PASS-1", location: "Example Office" }], s);
    expect(s).toMatchObject({ step: "submitted", orderRef: "PASS-1" });
  });

  it("blocks submit before a pass and ignores stray events", () => {
    expect(run([{ type: "SUBMIT" }]).step).toBe("idle");
    expect(run([{ type: "PASSED", photoRef: "x", token: "y" }]).step).toBe("idle");
    const s = run([{ type: "SELECT", fileName: "a.jpg" }]);
    expect(run([{ type: "SELECT", fileName: "b.jpg" }], s)).toBe(s); // cannot switch mid-check
  });

  it("returns to the passed step if submit fails, and offers retry after a service error", () => {
    let s = run([{ type: "SELECT", fileName: "a.jpg" }, { type: "PASSED", photoRef: "r", token: "t" }, { type: "SUBMIT" }, { type: "SUBMIT_FAILED", message: "x" }]);
    expect(s.step).toBe("passed");
    s = run([{ type: "SELECT", fileName: "a.jpg" }, { type: "CHECK_FAILED", message: "down" }, { type: "RETRY" }]);
    expect(s).toMatchObject({ step: "idle", attempts: 1 });
  });

  it("records a review request on the rejected state only", () => {
    const rej = run([{ type: "SELECT", fileName: "hat.jpg" }, { type: "REJECTED", issues: ["hat"] }, { type: "REVIEW_REQUESTED" }]);
    expect(rej).toMatchObject({ step: "rejected", reviewRequested: true });
    expect(run([{ type: "REVIEW_REQUESTED" }]).step).toBe("idle");
  });

  it("validates file type and size before upload", () => {
    expect(validatePhotoFile({ type: "application/pdf", size: 10 })).toMatch(/image/);
    expect(validatePhotoFile({ type: "image/jpeg", size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
    expect(validatePhotoFile({ type: "image/png", size: 1000 })).toBeNull();
  });
});
