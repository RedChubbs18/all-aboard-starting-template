import { describe, expect, it } from "vitest";
import { isLocalUrl } from "./publicUrl";

describe("isLocalUrl", () => {
  it("flags URLs a candidate's device cannot open", () => {
    for (const u of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000", "http://app.localhost"]) expect(isLocalUrl(u), u).toBe(true);
  });
  it("accepts a tunnel or public URL", () => {
    for (const u of ["https://abc123.ngrok.app", "https://myjourney.example.com"]) expect(isLocalUrl(u), u).toBe(false);
  });
});
