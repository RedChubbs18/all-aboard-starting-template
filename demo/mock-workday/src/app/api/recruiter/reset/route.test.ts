import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { POST } from "./route";
import { createOffer } from "@/lib/store";

const dir = mkdtempSync(path.join(tmpdir(), "wd-reset-"));
process.env.MOCK_WORKDAY_DATA_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost:3001/api/recruiter/reset", { method: "POST", headers: { origin: "http://localhost:3001", ...headers } });

describe("reset endpoint", () => {
  it("is recruiter-only: no bearer token gets 401 and data is kept", async () => {
    await createOffer({ jobTitle: "E", jobFamily: "ENGINEERING", teamKey: "t", teamName: "T", lineManagerKey: "m", lineManagerName: "M", startDate: "2027-01-11", conditions: [] });
    const res = await POST(req(), undefined);
    expect(res.status).toBe(401);
    expect(existsSync(path.join(dir, "offers.json"))).toBe(true);
  });
  it("rejects cross-origin requests", async () => {
    const res = await POST(req({ origin: "http://evil.example" }), undefined);
    expect(res.status).toBe(403);
    expect(existsSync(path.join(dir, "offers.json"))).toBe(true);
  });
  it("rejects an invalid bearer token", async () => {
    process.env.NEXT_PUBLIC_ENTRA_TENANT_ID = "tenant";
    process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID = "client";
    const res = await POST(req({ authorization: "Bearer not-a-jwt" }), undefined);
    expect(res.status).toBe(401);
    expect(existsSync(path.join(dir, "offers.json"))).toBe(true);
  });
});
