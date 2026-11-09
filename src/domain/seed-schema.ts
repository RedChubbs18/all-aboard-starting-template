import { z } from "zod";
import {
  CONTENT_TYPES,
  JOURNEY_STATUSES,
  OWNERS,
  ROLES,
  SOURCES,
  STAGES,
  TASK_STATUSES,
  TASK_TYPES,
} from "./types";

// Matches the "Content seed contract" in docs/PLAN.md.

export const stageSchema = z.enum(STAGES);

export const contentItemSchema = z.object({
  slug: z.string().min(1),
  type: z.enum(CONTENT_TYPES),
  title: z.string().min(1),
  summary: z.string(),
  body: z.string(), // Markdown
  stage: stageSchema.optional(),
  tags: z.array(z.string()),
});
export const contentFileSchema = z.array(contentItemSchema);

export const faqSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
  tags: z.array(z.string()),
  sourceSlug: z.string().optional(),
});
export const faqsFileSchema = z.array(faqSchema);

export const templateSchema = z
  .object({
    key: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional().default(""),
    stage: stageSchema,
    owner: z.enum(OWNERS),
    type: z.enum(TASK_TYPES),
    dueOffsetDays: z.number().int(),
    dependsOn: z.array(z.string()).default([]),
    source: z.enum(SOURCES).default("CORE"),
    /** Team the template belongs to (TEAM source). `teamKey` is the seed name; `teamId` also accepted. */
    teamKey: z.string().nullish(),
    teamId: z.string().nullish(),
    adapterKey: z.string().nullish(),
    gating: z.boolean().default(false),
    contentSlug: z.string().nullish(),
    condition: z.string().nullish(),
    sortOrder: z.number().int().optional(),
  })
  .refine((t) => t.source !== "TEAM" || !!(t.teamKey ?? t.teamId), { message: "TEAM templates need a teamKey" });
export const templatesFileSchema = z.array(templateSchema);

// people.json: { teams[], users[], journeys[] } cross-referenced by `key`.
export const teamSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  businessArea: z.string().nullish(),
  lmKey: z.string().nullish(),
});

const EXAMPLE_EMAIL = z
  .string()
  .email()
  .refine((e) => e.endsWith("@example.test"), "must use the example.test domain");

export const userSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  email: EXAMPLE_EMAIL,
  roles: z.array(z.enum(ROLES)), // may be empty: plain team members
  teamKey: z.string().nullish(),
  teamRole: z.string().nullish(),
  jobTitle: z.string().nullish(),
  reportsToKey: z.string().nullish(),
  bio: z.string().nullish(),
  buddyEligible: z.boolean().default(false),
  photo: z.string().nullish(),
});

export const taskStateSchema = z.object({
  templateKey: z.string().min(1),
  status: z.enum(TASK_STATUSES),
  blockedReason: z.string().nullish(),
});

export const HIREVIEW_SEED_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "ACTION_NEEDED", "CLEARED", "FAILED"] as const;

const dateString = z.string().min(1).refine((v) => !Number.isNaN(Date.parse(v)), "invalid date");

export const journeySeedSchema = z.object({
  key: z.string().min(1),
  starterKey: z.string().min(1),
  lmKey: z.string().min(1),
  buddyKey: z.string().nullish(),
  teamKey: z.string().min(1),
  startDate: dateString,
  currentStage: stageSchema,
  status: z.enum(JOURNEY_STATUSES),
  exitReason: z.string().nullish(),
  exitedAt: dateString.nullish(),
  completedAt: dateString.nullish(),
  hireviewStatus: z.enum(HIREVIEW_SEED_STATUSES).nullish(),
  /** Partial overrides applied after engine instantiation. Tasks in stages before currentStage are DONE; completed journeys are all DONE. */
  taskStates: z.array(taskStateSchema).default([]),
});

export const peopleFileSchema = z.object({
  teams: z.array(teamSchema),
  users: z.array(userSchema),
  journeys: z.array(journeySeedSchema),
});

/** prisma/seed.local.json: maps seeded users (by key) to real Entra identities. Never committed. */
export const seedLocalSchema = z.object({
  users: z.record(
    z.string(),
    z.object({ entraOid: z.string().min(1).optional(), upn: z.string().min(1).optional() }),
  ),
});

export type SeedContentItem = z.infer<typeof contentItemSchema>;
export type SeedFaq = z.infer<typeof faqSchema>;
export type SeedTemplate = z.infer<typeof templateSchema>;
export type SeedPeople = z.infer<typeof peopleFileSchema>;
export type SeedJourney = z.infer<typeof journeySeedSchema>;
export type SeedLocal = z.infer<typeof seedLocalSchema>;
