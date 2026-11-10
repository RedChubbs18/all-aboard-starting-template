import { describe, expect, it } from "vitest";
import { parseYouTubeId, youTubeEmbedUrl } from "./youtube";

describe("parseYouTubeId", () => {
  it.each([
    "https://youtu.be/4XfbVKkJHbI",
    "https://youtu.be/4XfbVKkJHbI?si=abc",
    "https://www.youtube.com/watch?v=4XfbVKkJHbI&t=3s",
    "https://youtube.com/watch?feature=share&v=4XfbVKkJHbI",
    "https://www.youtube.com/embed/4XfbVKkJHbI",
    "https://www.youtube-nocookie.com/embed/4XfbVKkJHbI?rel=0",
    "https://m.youtube.com/shorts/4XfbVKkJHbI",
  ])("parses %s", (u) => expect(parseYouTubeId(u)).toBe("4XfbVKkJHbI"));

  it.each([null, undefined, "", "not a url", "https://example.test/v.mp4", "https://evil.test/watch?v=4XfbVKkJHbI", "https://youtu.be/short", "javascript:alert(1)", "https://www.youtube.com/watch"])(
    "rejects %s",
    (u) => expect(parseYouTubeId(u)).toBeNull(),
  );
});

describe("youTubeEmbedUrl", () => {
  it("uses the privacy-enhanced host with the required params", () => {
    const u = new URL(youTubeEmbedUrl("4XfbVKkJHbI"));
    expect(u.origin).toBe("https://www.youtube-nocookie.com");
    expect(u.pathname).toBe("/embed/4XfbVKkJHbI");
    expect(Object.fromEntries(u.searchParams)).toEqual({ enablejsapi: "1", rel: "0", cc_load_policy: "1", hl: "en-GB", playsinline: "1" });
  });
});
