/**
 * Tiny, safe Markdown parser for admin-managed content (FR-1.6, FR-2.1).
 * It produces a typed AST that React renders node by node, so raw HTML is never injected:
 * any `<tag>` in the source is just text. Only a small subset is supported on purpose.
 *
 * Supported: #..#### headings, paragraphs, - / * lists, 1. lists, > quotes, --- rules, pipe tables,
 * **bold**, *italic*, `code`, [text](url), ![alt](url), bare http(s) URLs and {{variables}}.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "image"; alt: string; src: string }
  | { t: "var"; name: string };

export type Block =
  | { t: "heading"; level: 1 | 2 | 3 | 4; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "quote"; c: Inline[] }
  | { t: "hr" }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] };

/** Only http(s), mailto and same-site paths. Anything else (javascript:, data:, ...) is dropped. */
export function safeHref(raw: string): string | null {
  const u = raw.trim();
  if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u)) return u;
  // "//host" and "/" + backslash + "host" are protocol-relative (browsers treat a backslash as "/").
  if (u.startsWith("/") && !/^\/[/\\]/.test(u)) return u;
  if (u.startsWith("#")) return u;
  return null;
}

const INLINE_RE =
  /(`[^`]+`)|(!\[[^\]]*\]\([^)\s]+\))|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\{\{\s*[A-Za-z][\w]*\s*\}\})|(https?:\/\/[^\s)<>]+)/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ t: "text", v: src.slice(last, idx) });
    const tok = m[0];
    if (m[1]) out.push({ t: "code", v: tok.slice(1, -1) });
    else if (m[2]) {
      const mm = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(tok)!;
      out.push({ t: "image", alt: mm[1], src: mm[2] });
    } else if (m[3]) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      const href = safeHref(mm[2]);
      if (href) out.push({ t: "link", href, c: parseInline(mm[1]) });
      else out.push({ t: "text", v: mm[1] });
    } else if (m[4]) out.push({ t: "strong", c: parseInline(tok.slice(2, -2)) });
    else if (m[5]) out.push({ t: "em", c: parseInline(tok.slice(1, -1)) });
    else if (m[6]) out.push({ t: "var", name: tok.replace(/[{}\s]/g, "") });
    else if (m[7]) {
      // trailing sentence punctuation is not part of the URL
      const url = tok.replace(/[.,;:!?]+$/, "");
      out.push({ t: "link", href: url, c: [{ t: "text", v: url }] });
      if (url.length < tok.length) out.push({ t: "text", v: tok.slice(url.length) });
    }
    last = idx + tok.length;
  }
  if (last < src.length) out.push({ t: "text", v: src.slice(last) });
  return out;
}

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

const isTableSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes("-");

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ t: "heading", level: h[1].length as 1 | 2 | 3 | 4, c: parseInline(h[2].trim()) });
      i++;
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ t: "table", head, rows });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^\s*[-*]\s+/, "").trim()));
        i++;
      }
      blocks.push({ t: "ul", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^\s*\d+[.)]\s+/, "").trim()));
        i++;
      }
      blocks.push({ t: "ol", items });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ t: "quote", c: parseInline(buf.join(" ")) });
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|\s*[-*]\s+|\s*\d+[.)]\s+|>\s?)/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    blocks.push({ t: "p", c: parseInline(buf.join(" ")) });
  }
  return blocks;
}

/** Plain text of inline nodes (used for step lists and aria text). */
export function inlineText(nodes: Inline[], vars: Record<string, string> = {}): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case "text":
          return n.v;
        case "code":
          return n.v;
        case "image":
          return n.alt;
        case "var":
          return vars[n.name] ?? "";
        case "strong":
        case "em":
        case "link":
          return inlineText(n.c, vars);
      }
    })
    .join("");
}

/** Items of the first ordered list in the body: the "steps" of a checklist task (FR-3.4). */
export function extractSteps(md: string): string[] {
  const ol = parseMarkdown(md).find((b) => b.t === "ol");
  return ol && ol.t === "ol" ? ol.items.map((i) => inlineText(i)) : [];
}

/** Replace `{{name}}` in plain text. Unknown names are left as written. */
export function applyVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([A-Za-z]\w*)\s*\}\}/g, (m, name: string) => vars[name] ?? m);
}

/** First http(s) URL in a `**Video URL:** ` style line (VIDEO content). */
export function findLabelledUrl(md: string, label: string): string | null {
  const re = new RegExp(`${label}[^\\n]*?(https?:\\/\\/[^\\s\`)<>]+)`, "i");
  const m = re.exec(md);
  return m ? m[1] : null;
}

/** Anchor days list as plain English: "Tuesday and Thursday". */
export function formatDays(days: string[]): string {
  if (days.length === 0) return "to be confirmed by your line manager";
  if (days.length === 1) return days[0];
  return `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;
}
