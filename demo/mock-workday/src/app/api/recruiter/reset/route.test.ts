import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { POST } from "./route";
import { createOffer } from "@/lib/store";

const dir = mkdtempSync(path.join(tmpdir(), "wd-reset-"));
process.env.MOCK_WORKDAY_DATA_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const req = (headers: Record<string, string> = {}, url = "http://localhost:3001/api/recruiter/reset") =>
  new Request(url, { method: "POST", headers: { origin: new URL(url).origin, ...headers } });
const seed = () => createOffer({ jobTitle: "E", jobFamily: "ENGINEERING", teamKey: "t", teamName: "T", lineManagerKey: "m", lineManagerName: "M", startDate: "2027-01-11", conditions: [] });

describe("reset endpoint", () => {
  it("rejects cross-origin requests", async () => {
    await seed();
    const res = await POST(req({ origin: "http://evil.example" }), undefined);
    expect(res.status).toBe(403);
    expect(existsSync(path.join(dir, "offers.json"))).toBe(true);
  });
  it("rejects non-local hosts without a PIN and keeps the data", async () => {
    delete process.env.RECRUITER_PIN;
    const res = await POST(req({}, "http://192.168.1.50:3001/api/recruiter/reset"), undefined);
    expect(res.status).toBe(403);
    expect(existsSync(path.join(dir, "offers.json"))).toBe(true);
  });
  it("rejects a non-local host with a wrong PIN", async () => {
    process.env.RECRUITER_PIN = "right-pin-123";
    const res = await POST(req({ "x-recruiter-pin": "wrong-pin-123" }, "http://192.168.1.50:3001/api/recruiter/reset"), undefined);
    delete process.env.RECRUITER_PIN;
    expect(res.status).toBe(403);
    expect(existsSync(path.join(dir, "offers.json"))).toBe(true);
  });
  it("purges the data for a local request", async () => {
    const res = await POST(req(), undefined);
    expect(res.status).toBe(200);
    expect(existsSync(path.join(dir, "offers.json"))).toBe(false);
  });
});
