import { describe, expect, it } from "vitest";
import { csrfCheck, rateLimit } from "./guard";

const req = (headers: Record<string, string>, method = "POST", body: string | null = "{}") =>
  new Request("http://localhost:3001/api/x", { method, headers, body });

describe("csrfCheck", () => {
  it("allows same-origin JSON", () => {
    expect(csrfCheck(req({ origin: "http://localhost:3001", "content-type": "application/json" }))).toBeNull();
  });
  it("blocks cross-origin, missing origin and non-JSON", async () => {
    expect((csrfCheck(req({ origin: "http://evil.test", "content-type": "application/json" })))?.status).toBe(403);
    expect((csrfCheck(req({ "content-type": "application/json" })))?.status).toBe(403);
    expect((csrfCheck(req({ origin: "http://localhost:3001", "content-type": "text/plain" })))?.status).toBe(415);
  });
  it("ignores GET", () => expect(csrfCheck(req({}, "GET", null))).toBeNull());
});

describe("rateLimit", () => {
  it("limits within the window and recovers after", () => {
    expect(rateLimit("k", 2, 1000, 0)).toBe(true);
    expect(rateLimit("k", 2, 1000, 10)).toBe(true);
    expect(rateLimit("k", 2, 1000, 20)).toBe(false);
    expect(rateLimit("k", 2, 1000, 1500)).toBe(true);
  });
});
