/** Pure admin validation (no DB, no framework). Used by admin-service, the admin UI and tests. */
import { z } from "zod";
import { CONTENT_TYPES, OWNERS, ROLES, STAGES, TASK_TYPES, ADAPTER_KEYS } from "@/domain/types";

/** Named conditions understood by the engine (src/domain/engine.ts NAMED_CONDITIONS). */
export const NAMED_CONDITION_KEYS = ["induction-not-booked", "pev-steps-incomplete", "photo-check-failed"] as const;

/**
 * Finds a dependency cycle. Returns the keys along one cycle (first key repeated at the end),
 * or null when the graph is acyclic. Edges to unknown keys are ignored here.
 */
export function detectCycles(nodes: { key: string; dependsOn: string[] }[]): string[] | null {
  const deps = new Map(nodes.map((n) => [n.key, n.dependsOn]));
  const state = new Map<string, 1 | 2>(); // 1 = on stack, 2 = done
  const stack: string[] = [];
  const visit = (k: string): string[] | null => {
    state.set(k, 1);
    stack.push(k);
    for (const d of deps.get(k) ?? []) {
      if (!deps.has(d)) continue;
      if (state.get(d) === 1) return [...stack.slice(stack.indexOf(d)), d];
      if (!state.has(d)) {
        const c = visit(d);
        if (c) return c;
      }
    }
    stack.pop();
    state.set(k, 2);
    return null;
  };
  for (const n of nodes) {
    if (!state.has(n.key)) {
      const c = visit(n.key);
      if (c) return c;
    }
  }
  return null;
}

const nullableText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

export const templateInputSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers and hyphens"),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(4000).default(""),
  stage: z.enum(STAGES),
  owner: z.enum(OWNERS),
  type: z.enum(TASK_TYPES),
  dueOffsetDays: z.number().int("Whole days only").min(-365).max(365),
  gating: z.boolean().default(false),
  source: z.enum(["CORE", "TEAM"]).default("CORE"),
  teamId: nullableText,
  contentSlug: nullableText,
  adapterKey: nullableText,
  condition: nullableText,
  dependsOn: z.array(z.string()).default([]),
  sortOrder: z.number().int().optional(),
  active: z.boolean().default(true),
});
export type TemplateInputData = z.infer<typeof templateInputSchema>;

export type FieldErrors = Record<string, string>;

export interface ExistingTemplate {
  id: string;
  key: string;
  dependsOn: string[];
}

/**
 * Cross-record rules for a template. `existing` is every template in the DB
 * (the one being edited is excluded via `selfId`).
 */
export function validateTemplateRules(
  t: TemplateInputData,
  existing: ExistingTemplate[],
  ctx: { selfId?: string; contentSlugs?: string[] } = {},
): FieldErrors {
  const errors: FieldErrors = {};
  const others = existing.filter((e) => e.id !== ctx.selfId);
  const keys = new Set(others.map((e) => e.key));
  if (keys.has(t.key)) errors.key = "Key is already used by another template";
  if (t.source === "TEAM" && !t.teamId) errors.teamId = "Pick a team for a team template";
  if (t.source === "CORE" && t.teamId) errors.teamId = "Core templates do not belong to a team";
  if (t.adapterKey && !(ADAPTER_KEYS as readonly string[]).includes(t.adapterKey)) errors.adapterKey = "Unknown adapter";
  if (t.contentSlug && ctx.contentSlugs && !ctx.contentSlugs.includes(t.contentSlug)) errors.contentSlug = "No content item with that slug";

  const allKeys = new Set([...keys, t.key]);
  const missing = t.dependsOn.filter((d) => !allKeys.has(d));
  if (missing.length) errors.dependsOn = `Unknown template key(s): ${missing.join(", ")}`;
  else if (t.dependsOn.includes(t.key)) errors.dependsOn = "A template cannot depend on itself";
  else {
    const cycle = detectCycles([...others, { key: t.key, dependsOn: t.dependsOn }]);
    if (cycle) errors.dependsOn = `Dependency cycle: ${cycle.join(" -> ")}`;
  }

  if (t.condition) {
    const m = /^(done|notDone):(.+)$/.exec(t.condition);
    if (m) {
      if (!allKeys.has(m[2])) errors.condition = `Condition refers to unknown template key "${m[2]}"`;
    } else if (!(NAMED_CONDITION_KEYS as readonly string[]).includes(t.condition)) {
      errors.condition = `Unknown condition. Use ${NAMED_CONDITION_KEYS.join(", ")}, done:KEY or notDone:KEY`;
    }
  }
  return errors;
}

export const contentInputSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers and hyphens"),
  type: z.enum(CONTENT_TYPES),
  title: z.string().trim().min(1, "Title is required").max(200),
  summary: z.string().max(1000).default(""),
  body: z.string().max(50000).default(""),
  stage: z.enum(STAGES).nullish().transform((v) => v ?? null),
  tags: z.array(z.string().trim().min(1)).default([]),
});

export const faqInputSchema = z.object({
  question: z.string().trim().min(1, "Question is required").max(500),
  answer: z.string().trim().min(1, "Answer is required").max(5000),
  tags: z.array(z.string().trim().min(1)).default([]),
  sourceSlug: nullableText,
});

export const userUpdateSchema = z.object({
  roles: z.array(z.enum(ROLES)).min(1, "Pick at least one role"),
  teamId: nullableText,
  reportsToId: nullableText,
  buddyEligible: z.boolean(),
});

export const teamUpdateSchema = z.object({
  area: nullableText,
  lmId: nullableText,
});

export const seedStarterSchema = z
  .object({
    existingUserId: nullableText,
    displayName: z.string().trim().min(1).max(120).optional(),
    upn: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[^@\s]+@example\.test$/, "Use a placeholder address ending @example.test")
      .optional(),
    /** Passed to the identity adapter and never stored. */
    inviteEmail: z.string().trim().regex(/^[^@\s]+@[^@\s]+$/, "Enter an email address").optional(),
    teamId: z.string().min(1, "Pick a team"),
    lmId: z.string().min(1, "Pick a line manager"),
    buddyId: nullableText,
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date"),
  })
  .refine((v) => v.existingUserId || (v.displayName && v.upn), { message: "Pick a starter or enter a name and work email", path: ["displayName"] });

/**
 * Minimal Markdown to HTML for the admin preview. All text is escaped first, so raw HTML never
 * reaches the DOM. Links are limited to http(s), mailto and relative URLs.
 */
export function renderMarkdownSafe(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) =>
        /^(https?:\/\/|mailto:|\/(?![/\\]))/i.test(url) ? `<a href="${url}" rel="noopener noreferrer">${text}</a>` : text,
      );
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const open = (kind: "ul" | "ol") => {
    if (list !== kind) {
      close();
      out.push(`<${kind}>`);
      list = kind;
    }
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      close();
      const level = m[1].length + 2;
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
    } else if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) {
      open("ul");
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = /^\s*\d+\.\s+(.*)$/.exec(line))) {
      open("ol");
      out.push(`<li>${inline(m[1])}</li>`);
    } else if (line.trim() === "") {
      close();
    } else {
      close();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  close();
  return out.join("\n");
}
