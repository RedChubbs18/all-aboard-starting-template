import { describe, expect, it } from "vitest";
import { csrfCheck, isLoopbackHost, rateLimit, recruiterAccess } from "./guard";

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

describe("recruiter access (loopback / PIN)", () => {
  const local = (headers: Record<string, string> = {}) => new Request("http://localhost:3001/api/recruiter/offers", { headers });
  const remote = (headers: Record<string, string> = {}) => new Request("http://192.168.1.50:3001/api/recruiter/offers", { headers });
  const withPin = async (pin: string | undefined, fn: () => void | Promise<void>) => {
    const old = process.env.RECRUITER_PIN;
    if (pin === undefined) delete process.env.RECRUITER_PIN;
    else process.env.RECRUITER_PIN = pin;
    try {
      await fn();
    } finally {
      if (old === undefined) delete process.env.RECRUITER_PIN;
      else process.env.RECRUITER_PIN = old;
    }
  };

  it("recognises loopback hosts only", () => {
    for (const h of ["localhost:3001", "127.0.0.1:3001", "[::1]:3001", "127.5.5.5", "app.localhost:3001"]) expect(isLoopbackHost(h)).toBe(true);
    for (const h of ["192.168.1.50:3001", "evil.example", "localhost.evil.example", "127.0.0.1.evil.example", "", null]) expect(isLoopbackHost(h)).toBe(false);
  });

  it("allows local requests without a PIN", () => withPin(undefined, () => expect(recruiterAccess(local())).toBeNull()));
  it("treats proxied/tunnelled requests as non-local", () =>
    withPin(undefined, () => {
      expect(recruiterAccess(local({ "x-forwarded-for": "203.0.113.9" }))?.status).toBe(403);
      expect(recruiterAccess(local({ "x-forwarded-host": "abc.tunnel.example" }))?.status).toBe(403);
      expect(recruiterAccess(local({ forwarded: "for=203.0.113.9" }))?.status).toBe(403);
      expect(recruiterAccess(local({ "x-forwarded-for": "127.0.0.1" }))).toBeNull();
    }));
  it("denies non-local requests when no PIN is configured (fail closed)", () => withPin(undefined, () => expect(recruiterAccess(remote({ "x-recruiter-pin": "anything" }))?.status).toBe(403)));
  it("requires the right PIN on non-local requests", () =>
    withPin("correct-pin", async () => {
      const none = recruiterAccess(remote());
      expect(none?.status).toBe(403);
      expect(((await none?.json()) as { error: string }).error).toBe("pin_required");
      expect(recruiterAccess(remote({ "x-recruiter-pin": "wrong-pin!" }))?.status).toBe(403);
      expect(recruiterAccess(remote({ "x-recruiter-pin": "correct-pin" }))).toBeNull();
    }));
  it("rejects a wrong PIN even locally, but does not demand one", () =>
    withPin("correct-pin", () => {
      expect(recruiterAccess(local())).toBeNull();
      expect(recruiterAccess(local({ "x-recruiter-pin": "nope" }))?.status).toBe(403);
    }));
});
