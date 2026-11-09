import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { fakeClient, jsonMessage, message } from "../chatbot/fake-claude";
import { runAdapterContract } from "../contract";
import type { StateStore } from "../types";
import { resetAiBudget } from "../ai-budget";
import {
  ISSUE_NO_PHOTO,
  ISSUE_SIZE,
  ISSUE_TYPE,
  MAX_PHOTO_BYTES,
  buildPhotoRequest,
  createPhotoCheckReal,
  REVIEW_NOTE,
  normalisePhotoOutput,
  sniffImageType,
} from "./real";

const jpeg = (size = 64) => {
  const b = new Uint8Array(size);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b;
};
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const webp = () => new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const gif = () => new TextEncoder().encode("GIF89a......");

const json = jsonMessage;

runAdapterContract(
  "photocheck",
  (store: StateStore) => createPhotoCheckReal({ store, client: fakeClient(() => json({ pass: true, issues: [] })).client }),
  (make) => {
    it("returns { pass, issues }", async () => {
      expect(await make().check({ image: jpeg(), mimeType: "image/jpeg" })).toEqual({ pass: true, issues: [] });
      expect(await make().check({})).toEqual({ pass: false, issues: [ISSUE_NO_PHOTO] });
    });
  },
);

describe("photocheck real adapter", () => {
  it("sniffs jpeg, png and webp from magic bytes and rejects others", () => {
    expect(sniffImageType(jpeg())).toBe("image/jpeg");
    expect(sniffImageType(png())).toBe("image/png");
    expect(sniffImageType(webp())).toBe("image/webp");
    expect(sniffImageType(gif())).toBeNull();
  });

  it("rejects oversized and unsupported photos before calling the API", async () => {
    const { client, calls } = fakeClient(() => json({ pass: true, issues: [] }));
    const a = createPhotoCheckReal({ client });
    expect(await a.check({ image: jpeg(MAX_PHOTO_BYTES + 1), mimeType: "image/jpeg" })).toEqual({ pass: false, issues: [ISSUE_SIZE] });
    expect(await a.check({ image: gif(), mimeType: "image/gif" })).toEqual({ pass: false, issues: [ISSUE_TYPE] });
    expect(await a.check({ image: gif(), mimeType: "image/jpeg" })).toEqual({ pass: false, issues: [ISSUE_TYPE] }); // lying mime type
    expect(await a.check({ image: jpeg(), mimeType: "application/pdf" })).toEqual({ pass: false, issues: [ISSUE_TYPE] });
    expect(await a.check({ fileName: "me.jpg" })).toEqual({ pass: false, issues: [ISSUE_NO_PHOTO] });
    expect(calls).toHaveLength(0);
    expect((await a.check({ image: jpeg(MAX_PHOTO_BYTES), mimeType: "image/jpeg" })).pass).toBe(true); // exactly 5 MB is fine
  });

  it("sends the image as base64 vision input with structured output, low effort and fallbacks", async () => {
    const { client, calls } = fakeClient(() => json({ pass: true, issues: [] }));
    await createPhotoCheckReal({ client }).check({ image: png(), mimeType: "image/png" });
    const p = calls[0];
    expect(p.output_config?.format?.schema).toEqual(buildPhotoRequest(png(), "image/png").output_config?.format?.schema);
    expect(p.model).toBe("claude-opus-5-5");
    expect(p.max_tokens).toBe(512);
    expect(p.fallbacks).toBe("default");
    expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(p.output_config?.effort).toBe("low");
    expect(p.output_config?.format?.type).toBe("json_schema");
    const [img, text] = p.messages[0].content as [{ type: string; source: { media_type: string; data: string } }, { text: string }];
    expect(img.type).toBe("image");
    expect(img.source.media_type).toBe("image/png");
    expect(Buffer.from(img.source.data, "base64")).toEqual(Buffer.from(png()));
    expect(text.text).toMatch(/religious or medical head coverings/i);
    expect(text.text).toMatch(/ALLOWED when the whole face/);
    expect(text.text).toMatch(/More than one person/);
  });

  it("parses structured output into user-facing issues", async () => {
    const { client } = fakeClient(() => json({ pass: false, issues: ["Sunglasses detected. Please remove them and retake.", "  Face is too dark.  "] }));
    expect(await createPhotoCheckReal({ client }).check({ image: jpeg() })).toEqual({
      pass: false,
      issues: ["Sunglasses detected. Please remove them and retake.", "Face is too dark.", REVIEW_NOTE],
    });
  });

  it("normalises inconsistent output: pass clears issues, fail always has an issue", () => {
    expect(normalisePhotoOutput({ pass: true, issues: ["minor note"] })).toEqual({ pass: true, issues: [] });
    const f = normalisePhotoOutput({ pass: false, issues: [] });
    expect(f.pass).toBe(false);
    expect(f.issues).toHaveLength(2);
    expect(f.issues.at(-1)).toMatch(/line manager or P&P can review and recertify/);
    expect(normalisePhotoOutput({ pass: false, issues: Array(9).fill(0).map((_, i) => `issue ${i}`) }).issues).toHaveLength(6); // 5 issues + review note
  });

  it("treats a refusal as 'needs manual review' without reading content", async () => {
    const { client } = fakeClient(() => message("I can't help with that", "refusal"));
    expect(await createPhotoCheckReal({ client }).check({ image: jpeg(), fileName: "me.jpg" })).toEqual({ pass: false, issues: [], needsManualReview: true });
  });

  it.each([
    ["rate limit", () => new Anthropic.RateLimitError(429, { type: "error" }, "slow down", new Headers())],
    ["overloaded", () => new Anthropic.APIError(529, { type: "error" }, "overloaded", new Headers())],
    ["bad output", () => "not json"],
  ])("fails closed and flags for manual review on %s", async (_label, make) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = fakeClient(() => {
      const v = make();
      if (typeof v === "string") return message(v);
      throw v;
    });
    const a = createPhotoCheckReal({ client });
    expect(await a.check({ image: jpeg(), fileName: "me.jpg" })).toEqual({ pass: false, issues: [], needsManualReview: true });
    // The client-supplied file name never decides in REAL mode (mock heuristic is not used).
    expect(await a.check({ image: jpeg(), fileName: "me-sunglasses.jpg" })).toEqual({ pass: false, issues: [], needsManualReview: true });
    // Image bytes never reach the logs.
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/\/9j\/|base64/);
    warn.mockRestore();
  });

  it("degrades without a client (no API key)", async () => {
    const a = createPhotoCheckReal({ client: null });
    expect(await a.check({ image: jpeg() })).toEqual({ pass: false, issues: [], needsManualReview: true });
    expect((await a.getStatus("GLOBAL")).status).toBe("degraded");
  });

  it("stops calling Claude once the shared daily cap is reached (pending manual review)", async () => {
    resetAiBudget();
    process.env.AI_DAILY_CALL_CAP = "2";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { client, calls } = fakeClient(() => json({ pass: true, issues: [] }));
      const a = createPhotoCheckReal({ client });
      expect((await a.check({ image: jpeg() })).pass).toBe(true);
      expect((await a.check({ image: jpeg() })).pass).toBe(true);
      expect(await a.check({ image: jpeg() })).toEqual({ pass: false, issues: [], needsManualReview: true });
      expect(calls).toHaveLength(2);
    } finally {
      delete process.env.AI_DAILY_CALL_CAP;
      resetAiBudget();
      warn.mockRestore();
    }
  });
});
