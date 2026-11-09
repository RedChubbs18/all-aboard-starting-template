/**
 * Validation shared by the LM forms (client) and the LM API routes (server),
 * so both layers enforce identical rules (FR-3.6, FR-3.8, FR-4.7, FR-4.9).
 */
import { z } from "zod";
import { GOAL_HORIZONS, STAGES } from "@/domain/types";

export const CADENCES = ["WEEKLY", "FORTNIGHTLY", "MONTHLY"] as const;
export type Cadence = (typeof CADENCES)[number];

/** Tasks whose `evidence` holds a newline separated list of Teams links (FR-3.13). References only. */
export const LINK_TASK_KEYS: readonly string[] = ["forward-team-calls", "team-recurring-calls-list"];
export const MAX_LINKS = 10;

const text = (label: string, max: number) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

const isoDate = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .min(1, `${label} is required`)
    .refine((v) => !Number.isNaN(new Date(v).getTime()), `${label} must be a valid date`);

export const bespokeTaskSchema = z.object({
  title: text("Title", 120),
  description: z.string().trim().max(500, "Description must be 500 characters or fewer").optional().default(""),
  stage: z.enum(STAGES, { error: "Choose a stage" }),
  dueDate: isoDate("Due date"),
});

/** F11: a team checklist item. `owner` is who ticks it off: the LM or the starter. */
export const teamItemSchema = z.object({
  title: text("Title", 120),
  description: z.string().trim().max(500, "Description must be 500 characters or fewer").optional().default(""),
  dueDate: isoDate("Due date"),
  owner: z.enum(["LM", "STARTER"], { error: "Choose who does this" }),
});

export const buddySchema = z.object({ buddyId: z.string({ error: "Choose a buddy" }).min(1, "Choose a buddy") });

export const day0Schema = z.object({
  where: text("Where", 120),
  who: text("Who", 120),
  whenAt: isoDate("When"),
});

export const checkInSchema = z.object({
  cadence: z.enum(CADENCES, { error: "Choose how often" }),
  scheduledAt: isoDate("First check-in"),
});

export const goalSchema = z.object({
  horizon: z.enum(GOAL_HORIZONS, { error: "Choose a horizon" }),
  text: text("Goal", 200),
});

export const goalPatchSchema = z
  .object({ text: text("Goal", 200).optional(), done: z.boolean().optional() })
  .refine((v) => v.text !== undefined || v.done !== undefined, "Nothing to update");

/** Team call links must be Microsoft Teams links over https (FR-3.13, L6). */
export const TEAMS_LINK_HOSTS: readonly string[] = ["teams.microsoft.com", "teams.live.com"];

export const linkSchema = z
  .string()
  .trim()
  .max(500, "Links must be 500 characters or fewer")
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && TEAMS_LINK_HOSTS.includes(u.hostname.toLowerCase()) && !u.username && !u.password && !u.port;
    } catch {
      return false;
    }
  }, "Each link must be a Microsoft Teams https:// link")

export const taskPatchSchema = z
  .object({
    status: z.enum(["DONE", "TODO"]).optional(),
    links: z.array(linkSchema).max(MAX_LINKS, `Add at most ${MAX_LINKS} links`).optional(),
  })
  .refine((v) => v.status !== undefined || v.links !== undefined, "Nothing to update");

/** Flatten zod issues to `{ field: message }` (first message wins). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const k = i.path.length ? String(i.path[0]) : "_";
    if (!(k in out)) out[k] = i.message;
  }
  return out;
}
