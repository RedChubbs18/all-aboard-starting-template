/** YouTube helpers for the Group Exec welcome video (FR-4.6). Pure, so they are easy to test. */

const ID = /^[A-Za-z0-9_-]{11}$/;

/** Video id from a youtu.be, watch?v=, /embed/, /shorts/ or /live/ URL (youtube.com, nocookie, m.). Null otherwise. */
export function parseYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") id = u.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) id = parts[1] ?? null;
  }
  return id && ID.test(id) ? id : null;
}

export const youTubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/** Privacy-enhanced embed URL with captions on and the JS API enabled. */
export function youTubeEmbedUrl(id: string, origin?: string): string {
  const p = new URLSearchParams({ enablejsapi: "1", rel: "0", cc_load_policy: "1", hl: "en-GB", playsinline: "1" });
  if (origin) p.set("origin", origin);
  return `https://www.youtube-nocookie.com/embed/${id}?${p.toString()}`;
}
