import { describe, expect, it } from "vitest";
import { callLink, chatLink, meetingLink } from "./teams";

describe("teams deep links", () => {
  it("builds a chat link for one user", () => {
    expect(chatLink("kai.demo@example.test")).toBe("https://teams.microsoft.com/l/chat/0/0?users=kai.demo%40example.test");
  });
  it("joins several users with literal commas and encodes the message", () => {
    const u = chatLink(["a@example.test", "b+tag@example.test"], { message: "Hi there & welcome? 100%" });
    expect(u).toBe("https://teams.microsoft.com/l/chat/0/0?users=a%40example.test,b%2Btag%40example.test&message=Hi%20there%20%26%20welcome%3F%20100%25");
  });
  it("supports a topic name", () => {
    expect(chatLink(["a@x.test", "b@x.test"], { topicName: "Day 0 / plans" })).toContain("&topicName=Day%200%20%2F%20plans");
  });
  it("builds call links", () => {
    expect(callLink("a@example.test")).toBe("https://teams.microsoft.com/l/call/0/0?users=a%40example.test");
    expect(callLink(["a@x.test"], { video: true })).toMatch(/&withVideo=true$/);
  });
  it("builds meeting scheduling links", () => {
    const u = meetingLink({
      subject: "Check-in: Alex & Dana",
      attendees: ["a@example.test", "b@example.test"],
      startTime: new Date("2026-12-01T09:00:00Z"),
      endTime: "2026-12-01T09:30:00Z",
      content: "Weekly check-in",
    });
    expect(u).toBe(
      "https://teams.microsoft.com/l/meeting/new?subject=Check-in%3A%20Alex%20%26%20Dana&attendees=a%40example.test,b%40example.test&startTime=2026-12-01T09%3A00%3A00.000Z&endTime=2026-12-01T09%3A30%3A00Z&content=Weekly%20check-in",
    );
    expect(meetingLink({})).toBe("https://teams.microsoft.com/l/meeting/new");
  });
  it("rejects empty user lists", () => {
    expect(() => chatLink([])).toThrow();
    expect(() => chatLink(["  "])).toThrow();
  });
  it("never lets a hostile value break out of its parameter", () => {
    const u = chatLink("x@example.test&users=evil@evil.test#frag");
    expect(u.split("&")).toHaveLength(1);
    expect(u).not.toContain("#");
  });
});
