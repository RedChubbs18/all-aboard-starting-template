import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sign, signedHeaders, webhookSecret } from "./hmac";

describe("hmac", () => {
  it("signs '<timestamp>.<raw body>' with HMAC-SHA256 as sha256=<hex>", () => {
    const expected = "sha256=" + createHmac("sha256", "s3cret").update('1700000000.{"a":1}').digest("hex");
    expect(sign("s3cret", "1700000000", '{"a":1}')).toBe(expected);
  });

  it("empty body signs '<timestamp>.' (directory GET)", () => {
    const h = signedHeaders("k".repeat(32), "", new Date(1_700_000_000_000));
    expect(h["x-workday-timestamp"]).toBe("1700000000");
    expect(h["x-workday-signature"]).toBe("sha256=" + createHmac("sha256", "k".repeat(32)).update("1700000000.").digest("hex"));
  });

  it("requires a 32+ char secret", () => {
    process.env.WORKDAY_WEBHOOK_SECRET = "short";
    expect(webhookSecret()).toBeNull();
    process.env.WORKDAY_WEBHOOK_SECRET = "x".repeat(32);
    expect(webhookSecret()).toBe("x".repeat(32));
    process.env.WORKDAY_WEBHOOK_SECRET = "";
  });
});
