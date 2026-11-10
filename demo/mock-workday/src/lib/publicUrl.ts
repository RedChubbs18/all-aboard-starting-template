/** True for a URL a candidate's own device cannot open (localhost, 127.x, ::1). */
export const isLocalUrl = (u: string): boolean => {
  try {
    const h = new URL(u).hostname.replace(/^\[|\]$/g, "");
    return h === "localhost" || h.endsWith(".localhost") || h === "::1" || /^127\./.test(h);
  } catch {
    return false;
  }
};
