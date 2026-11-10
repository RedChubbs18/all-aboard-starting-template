import { z } from "zod";
import { JOB_FAMILIES } from "./job-family";
import type { TemplateInput } from "./types";
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
    optional: z.boolean().default(false),
    autoCompleteOnOpen: z.boolean().default(false),
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
  /** D29: drives the device entitlement. Optional so older fixtures still load. */
  jobFamily: z.enum(JOB_FAMILIES).nullish(),
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

export const FIRSTADVANTAGE_SEED_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "ACTION_NEEDED", "CLEARED", "FAILED"] as const;

const dateString = z.string().min(1).refine((v) => !Number.isNaN(Date.parse(v)), "invalid date");

/** Optional synthetic history for MI (dates are YYYY-MM-DD). Read by src/server/seed-history.ts only. */
export const journeyHistorySchema = z.object({
  /** When the journey was created (offer accepted). */
  offerAcceptedAt: dateString,
  /** Entry date per later stage; missing stages fall back to 4-day steps. */
  stageEnteredAt: z.record(z.string(), dateString).default({}),
  /** First Advantage timeline: an action-needed spell and the clearance date. */
  vetting: z.object({ actionNeededAt: dateString.nullish(), actionResolvedAt: dateString.nullish(), clearedAt: dateString.nullish() }).nullish(),
  /** Exit data carried on the JOURNEY_EXITED event (D14). */
  exit: z.object({ reasonSource: z.enum(["COLLEAGUE", "PNP"]), comment: z.string().nullish() }).nullish(),
  /** Starter-owned tasks are never completed after this date (simulates a quiet starter). */
  lastStarterActivityAt: dateString.nullish(),
  /** LM tasks are completed 0..N days after their due date (deterministic per task). */
  lmDelayDays: z.number().int().min(0).max(30).default(0),
});

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
  firstAdvantageStatus: z.enum(FIRSTADVANTAGE_SEED_STATUSES).nullish(),
  /** Partial overrides applied after engine instantiation. Tasks in stages before currentStage are DONE; completed journeys are all DONE. */
  taskStates: z.array(taskStateSchema).default([]),
  history: journeyHistorySchema.nullish(),
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

/** Seed template row to the engine's TemplateInput (shared by the seed loader and tests that load the real content/seed/templates.json). */
export const toTemplateInput = (t: SeedTemplate): TemplateInput => ({
  key: t.key,
  title: t.title,
  description: t.description,
  stage: t.stage,
  owner: t.owner,
  type: t.type,
  dueOffsetDays: t.dueOffsetDays,
  dependsOn: t.dependsOn,
  source: t.source,
  teamId: t.teamKey ?? t.teamId ?? null,
  adapterKey: t.adapterKey ?? null,
  gating: t.gating,
  optional: t.optional,
  autoCompleteOnOpen: t.autoCompleteOnOpen,
  contentSlug: t.contentSlug ?? null,
  condition: t.condition ?? null,
  sortOrder: t.sortOrder,
});

