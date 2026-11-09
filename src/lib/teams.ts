/**
 * Microsoft Teams deep links. Pure URL building: no Graph calls, no writes.
 * https://learn.microsoft.com/microsoftteams/platform/concepts/build-and-test/deep-link-teams
 */
const BASE = "https://teams.microsoft.com/l";

/** UPNs are comma separated and individually encoded (commas stay literal, as Teams expects). */
function users(upns: string | string[]): string {
  const list = (Array.isArray(upns) ? upns : [upns]).map((u) => u.trim()).filter(Boolean);
  if (list.length === 0) throw new Error("At least one user (UPN) is required");
  return list.map(encodeURIComponent).join(",");
}

export function chatLink(upns: string | string[], opts: { message?: string; topicName?: string } = {}): string {
  let url = `${BASE}/chat/0/0?users=${users(upns)}`;
  if (opts.topicName) url += `&topicName=${encodeURIComponent(opts.topicName)}`;
  if (opts.message) url += `&message=${encodeURIComponent(opts.message)}`;
  return url;
}

export function callLink(upns: string | string[], opts: { video?: boolean } = {}): string {
  return `${BASE}/call/0/0?users=${users(upns)}${opts.video ? "&withVideo=true" : ""}`;
}

/** Opens the Teams "new meeting" scheduling form prefilled. Times are ISO strings or Dates. */
export function meetingLink(opts: {
  subject?: string;
  attendees?: string | string[];
  startTime?: Date | string;
  endTime?: Date | string;
  content?: string;
}): string {
  const p: string[] = [];
  const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : d);
  if (opts.subject) p.push(`subject=${encodeURIComponent(opts.subject)}`);
  if (opts.attendees) p.push(`attendees=${users(opts.attendees)}`);
  if (opts.startTime) p.push(`startTime=${encodeURIComponent(iso(opts.startTime))}`);
  if (opts.endTime) p.push(`endTime=${encodeURIComponent(iso(opts.endTime))}`);
  if (opts.content) p.push(`content=${encodeURIComponent(opts.content)}`);
  return `${BASE}/meeting/new${p.length ? `?${p.join("&")}` : ""}`;
}
