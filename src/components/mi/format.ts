/** Display helpers for the MI sections. Pure and client-safe. */
export const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Not recorded");
export const fmtShortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const days = (n: number | null) => (n === null ? "No data" : `${n} d`);
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const percent = (n: number | null) => (n === null ? "No data" : `${n}%`);
/** "2026-06" to "Jun 2026". */
export const fmtMonth = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
