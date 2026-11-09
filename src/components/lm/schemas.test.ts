import { describe, expect, it } from "vitest";
import { linkSchema, taskPatchSchema } from "./schemas";

describe("team call links (L6)", () => {
  it("accepts Microsoft Teams links over https", () => {
    for (const v of [
      "https://teams.microsoft.com/l/meetup-join/abc",
      "https://teams.live.com/meet/123",
      "  https://TEAMS.microsoft.com/l/channel/x  ",
    ]) expect(linkSchema.safeParse(v).success, v).toBe(true);
  });

  it("rejects other hosts, look-alikes, http and odd forms", () => {
    for (const v of [
      "http://teams.microsoft.com/l/meetup-join/abc",
      "https://evil.example/teams.microsoft.com",
      "https://teams.microsoft.com.evil.example/x",
      "https://evilteams.microsoft.com/x",
      "https://user:pw@teams.microsoft.com/x",
      "https://teams.microsoft.com:8443/x",
      "javascript:alert(1)",
      "//teams.microsoft.com/x",
      "teams.microsoft.com/x",
    ]) expect(linkSchema.safeParse(v).success, v).toBe(false);
    expect(taskPatchSchema.safeParse({ links: ["https://example.com/x"] }).success).toBe(false);
  });
});
