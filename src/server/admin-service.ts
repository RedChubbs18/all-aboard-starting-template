/**
 * Admin operations (FR-AD.*). Every write records an audit Event via journey-service.recordEvent
 * (type ADMIN_*, journeyId null, actorId = the admin).
 * Journey/Task rows are only ever written through journey-service (seedNewStarter).
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "./db";
import { ADAPTER_KEYS, type AdapterKey } from "@/domain/types";
import { parseRoles } from "@/lib/auth/roles";
import { getAdapter, listAdapterModes, setAdapterMode, type AdapterMode } from "@/adapters/registry";
import { EXIT_REASONS } from "@/domain/exit-reasons";
import { completeGuestInviteTask } from "./integration-service";
import { getWorkAccountStatus } from "./identity-conversion";
import { createJourneyForStarter, exitJourney, recordEvent, NotFoundError } from "./journey-service";
import {
  contentInputSchema,
  faqInputSchema,
  seedStarterSchema,
  teamUpdateSchema,
  templateInputSchema,
  userUpdateSchema,
  validateTemplateRules,
  type FieldErrors,
  type TemplateInputData,
} from "./admin-validation";

export class AdminError extends Error {
  constructor(
    public status: 400 | 404 | 409,
    message: string,
    public fields?: FieldErrors,
  ) {
    super(message);
  }
}

export function zodFields(e: z.ZodError): FieldErrors {
  const f: FieldErrors = {};
  for (const i of e.issues) f[i.path.join(".") || "_"] ??= i.message;
  return f;
}

function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new AdminError(400, "Validation failed", zodFields(r.error));
  return r.data;
}

/** Maps service errors to JSON responses. Wrap route handler bodies with this. */
export async function adminResponse(fn: () => Promise<unknown>, status = 200): Promise<Response> {
  try {
    return Response.json(await fn(), { status });
  } catch (e) {
    if (e instanceof AdminError) return Response.json({ error: "validation", message: e.message, fields: e.fields ?? {} }, { status: e.status });
    if (e instanceof NotFoundError) return Response.json({ error: "not_found", message: e.message }, { status: 404 });
    throw e;
  }
}

const audit = (actorId: string, type: string, entity: string, entityId: string | null, data?: Record<string, unknown>, journeyId: string | null = null) =>
  recordEvent({ journeyId, actorId, type, entity, entityId, data: data ?? null });

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

// ---------------------------------------------------------------- overview

export async function getOverview() {
  const [templates, content, faqs, users, teams, journeys, adapters] = await Promise.all([
    prisma.taskTemplate.count(),
    prisma.contentItem.count(),
    prisma.faq.count(),
    prisma.user.count(),
    prisma.team.count(),
    prisma.journey.count(),
    listAdapterModes(),
  ]);
  return { templates, content, faqs, users, teams, journeys, adapters };
}

// --------------------------------------------------------------- templates

const templateDto = (t: Awaited<ReturnType<typeof prisma.taskTemplate.findFirstOrThrow>>) => ({ ...t, dependsOn: strArr(t.dependsOn) });

export async function listTemplates() {
  const rows = await prisma.taskTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { key: "asc" }] });
  return rows.map(templateDto);
}

async function checkTemplate(data: TemplateInputData, selfId?: string) {
  const [existing, slugs, team] = await Promise.all([
    prisma.taskTemplate.findMany({ select: { id: true, key: true, dependsOn: true } }),
    prisma.contentItem.findMany({ select: { slug: true } }),
    data.teamId ? prisma.team.findUnique({ where: { id: data.teamId } }) : null,
  ]);
  const errors = validateTemplateRules(data, existing.map((e) => ({ ...e, dependsOn: strArr(e.dependsOn) })), {
    selfId,
    contentSlugs: slugs.map((s) => s.slug),
  });
  if (data.teamId && !team) errors.teamId = "Unknown team";
  if (Object.keys(errors).length) throw new AdminError(400, "Validation failed", errors);
}

export async function createTemplate(actorId: string, input: unknown) {
  const data = parse(templateInputSchema, input);
  await checkTemplate(data);
  const max = await prisma.taskTemplate.aggregate({ _max: { sortOrder: true } });
  const row = await prisma.taskTemplate.create({ data: { ...data, sortOrder: data.sortOrder ?? (max._max.sortOrder ?? 0) + 10 } });
  await audit(actorId, "ADMIN_TEMPLATE_CREATED", "TaskTemplate", row.id, { key: row.key });
  return templateDto(row);
}

/** The key is immutable: tasks, dependencies and conditions refer to it. */
export async function updateTemplate(actorId: string, id: string, input: unknown) {
  const current = await prisma.taskTemplate.findUnique({ where: { id } });
  if (!current) throw new NotFoundError("Template not found");
  const data = parse(templateInputSchema, input);
  if (data.key !== current.key) throw new AdminError(400, "Validation failed", { key: "A template key cannot be changed. Create a new template instead." });
  await checkTemplate(data, id);
  const row = await prisma.taskTemplate.update({ where: { id }, data: { ...data, sortOrder: data.sortOrder ?? current.sortOrder } });
  await audit(actorId, "ADMIN_TEMPLATE_UPDATED", "TaskTemplate", id, { key: row.key });
  return templateDto(row);
}

export async function deleteTemplate(actorId: string, id: string) {
  const current = await prisma.taskTemplate.findUnique({ where: { id } });
  if (!current) throw new NotFoundError("Template not found");
  const all = await prisma.taskTemplate.findMany({ where: { id: { not: id } } });
  const refs = all.filter((t) => strArr(t.dependsOn).includes(current.key) || new RegExp(`^(done|notDone):${current.key}$`).test(t.condition ?? ""));
  if (refs.length) {
    throw new AdminError(409, `Other templates still refer to "${current.key}": ${refs.map((r) => r.key).join(", ")}`);
  }
  await prisma.taskTemplate.delete({ where: { id } });
  await audit(actorId, "ADMIN_TEMPLATE_DELETED", "TaskTemplate", id, { key: current.key });
  return { ok: true };
}

// ----------------------------------------------------------------- content

export async function listContent() {
  const rows = await prisma.contentItem.findMany({ orderBy: [{ type: "asc" }, { title: "asc" }] });
  return rows.map((c) => ({ ...c, tags: strArr(c.tags) }));
}

export async function createContent(actorId: string, input: unknown) {
  const data = parse(contentInputSchema, input);
  if (await prisma.contentItem.findUnique({ where: { slug: data.slug } })) throw new AdminError(400, "Validation failed", { slug: "Slug is already used" });
  const row = await prisma.contentItem.create({ data });
  await audit(actorId, "ADMIN_CONTENT_CREATED", "ContentItem", row.id, { slug: row.slug });
  return { ...row, tags: strArr(row.tags) };
}

export async function updateContent(actorId: string, id: string, input: unknown) {
  const current = await prisma.contentItem.findUnique({ where: { id } });
  if (!current) throw new NotFoundError("Content item not found");
  const data = parse(contentInputSchema, input);
  if (data.slug !== current.slug) {
    if (await prisma.contentItem.findUnique({ where: { slug: data.slug } })) throw new AdminError(400, "Validation failed", { slug: "Slug is already used" });
    const used = await usedSlugRefs(current.slug);
    if (used.length) throw new AdminError(400, "Validation failed", { slug: `Slug is referenced by ${used.join(", ")}. Create a new item instead.` });
  }
  const row = await prisma.contentItem.update({ where: { id }, data });
  await audit(actorId, "ADMIN_CONTENT_UPDATED", "ContentItem", id, { slug: row.slug });
  return { ...row, tags: strArr(row.tags) };
}

async function usedSlugRefs(slug: string): Promise<string[]> {
  const [t, f] = await Promise.all([
    prisma.taskTemplate.count({ where: { contentSlug: slug } }),
    prisma.faq.count({ where: { sourceSlug: slug } }),
  ]);
  return [t && `${t} template(s)`, f && `${f} FAQ(s)`].filter(Boolean) as string[];
}

export async function deleteContent(actorId: string, id: string) {
  const current = await prisma.contentItem.findUnique({ where: { id } });
  if (!current) throw new NotFoundError("Content item not found");
  const used = await usedSlugRefs(current.slug);
  if (used.length) throw new AdminError(409, `Still referenced by ${used.join(" and ")}. Remove the references first.`);
  await prisma.contentItem.delete({ where: { id } });
  await audit(actorId, "ADMIN_CONTENT_DELETED", "ContentItem", id, { slug: current.slug });
  return { ok: true };
}

// --------------------------------------------------------------------- FAQs

const faqDto = (f: { id: string; question: string; answer: string; tags: unknown; sourceSlug: string | null }) => ({ ...f, tags: strArr(f.tags) });

export async function listFaqs() {
  return (await prisma.faq.findMany({ orderBy: { question: "asc" } })).map(faqDto);
}

async function checkFaqSource(slug: string | null) {
  if (slug && !(await prisma.contentItem.findUnique({ where: { slug } }))) throw new AdminError(400, "Validation failed", { sourceSlug: "No content item with that slug" });
}

export async function createFaq(actorId: string, input: unknown) {
  const data = parse(faqInputSchema, input);
  await checkFaqSource(data.sourceSlug);
  const row = await prisma.faq.create({ data: { id: `faq-${randomUUID().slice(0, 8)}`, ...data } });
  await audit(actorId, "ADMIN_FAQ_CREATED", "Faq", row.id);
  return faqDto(row);
}

export async function updateFaq(actorId: string, id: string, input: unknown) {
  if (!(await prisma.faq.findUnique({ where: { id } }))) throw new NotFoundError("FAQ not found");
  const data = parse(faqInputSchema, input);
  await checkFaqSource(data.sourceSlug);
  const row = await prisma.faq.update({ where: { id }, data });
  await audit(actorId, "ADMIN_FAQ_UPDATED", "Faq", id);
  return faqDto(row);
}

export async function deleteFaq(actorId: string, id: string) {
  if (!(await prisma.faq.findUnique({ where: { id } }))) throw new NotFoundError("FAQ not found");
  await prisma.faq.delete({ where: { id } });
  await audit(actorId, "ADMIN_FAQ_DELETED", "Faq", id);
  return { ok: true };
}

// ---------------------------------------------------------- teams & people

export async function listTeams() {
  const [teams, users] = await Promise.all([prisma.team.findMany({ orderBy: { name: "asc" } }), prisma.user.findMany()]);
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    area: t.area,
    lmId: t.lmId,
    lmName: users.find((u) => u.id === t.lmId)?.displayName ?? null,
    memberCount: users.filter((u) => u.teamId === t.id).length,
  }));
}

export async function listUsers() {
  const rows = await prisma.user.findMany({ orderBy: { displayName: "asc" }, include: { team: true } });
  return rows.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    upn: u.upn,
    roles: parseRoles(u.roles),
    teamId: u.teamId,
    teamName: u.team?.name ?? null,
    reportsToId: u.reportsToId,
    buddyEligible: u.buddyEligible,
    jobTitle: u.jobTitle,
  }));
}

export async function updateUser(actorId: string, id: string, input: unknown) {
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) throw new NotFoundError("User not found");
  const data = parse(userUpdateSchema, input);
  const roles = [...new Set(data.roles)];
  if (id === actorId && !roles.includes("ADMIN")) throw new AdminError(400, "Validation failed", { roles: "You cannot remove your own Admin role" });
  const errors: FieldErrors = {};
  if (data.teamId && !(await prisma.team.findUnique({ where: { id: data.teamId } }))) errors.teamId = "Unknown team";
  if (data.reportsToId) {
    if (data.reportsToId === id) errors.reportsToId = "A person cannot report to themselves";
    else if (!(await prisma.user.findUnique({ where: { id: data.reportsToId } }))) errors.reportsToId = "Unknown line manager";
  }
  if (Object.keys(errors).length) throw new AdminError(400, "Validation failed", errors);
  const row = await prisma.user.update({
    where: { id },
    data: { roles, teamId: data.teamId, reportsToId: data.reportsToId, buddyEligible: data.buddyEligible },
  });
  await audit(actorId, "ADMIN_USER_UPDATED", "User", id, { roles, teamId: data.teamId, reportsToId: data.reportsToId, buddyEligible: data.buddyEligible });
  return { id: row.id };
}

export async function updateTeam(actorId: string, id: string, input: unknown) {
  if (!(await prisma.team.findUnique({ where: { id } }))) throw new NotFoundError("Team not found");
  const data = parse(teamUpdateSchema, input);
  if (data.lmId && !(await prisma.user.findUnique({ where: { id: data.lmId } }))) throw new AdminError(400, "Validation failed", { lmId: "Unknown user" });
  await prisma.team.update({ where: { id }, data });
  await audit(actorId, "ADMIN_TEAM_UPDATED", "Team", id, data);
  return { id };
}

// ---------------------------------------------------------------- adapters

export const listAdapters = () => listAdapterModes();

export async function changeAdapterMode(actorId: string, key: string, mode: unknown) {
  if (!(ADAPTER_KEYS as readonly string[]).includes(key)) throw new NotFoundError("Unknown adapter");
  if (mode !== "MOCK" && mode !== "REAL") throw new AdminError(400, "Validation failed", { mode: "Mode must be MOCK or REAL" });
  const before = (await listAdapterModes()).find((a) => a.key === key)!;
  await setAdapterMode(key as AdapterKey, mode as AdapterMode);
  await audit(actorId, "ADMIN_ADAPTER_MODE_CHANGED", "Adapter", key, { from: before.mode, to: mode, envOverride: before.envOverride });
  return (await listAdapterModes()).find((a) => a.key === key)!;
}

// ------------------------------------------------------- seed a new starter

/**
 * Demo step 1. Creates (or reuses) the starter, creates the journey from the active templates
 * (CORE plus the team's), then sends the guest invite through the IdentityAdapter (FR-1.1).
 * The invite needs the journey id, so it runs after creation; if it fails the journey still exists
 * and the failure is returned and audited (INTEGRATION_FAILED).
 * `deferInvite` (Graph invites, D19) skips the server-side invite; the browser reports the outcome later.
 */
export async function seedNewStarter(actorId: string, input: unknown, opts: { deferInvite?: boolean } = {}) {
  const v = parse(seedStarterSchema, input);
  const errors: FieldErrors = {};
  const [team, lm, buddy, existing] = await Promise.all([
    prisma.team.findUnique({ where: { id: v.teamId } }),
    prisma.user.findUnique({ where: { id: v.lmId } }),
    v.buddyId ? prisma.user.findUnique({ where: { id: v.buddyId } }) : null,
    v.existingUserId ? prisma.user.findUnique({ where: { id: v.existingUserId } }) : null,
  ]);
  if (!team) errors.teamId = "Unknown team";
  if (!lm || !parseRoles(lm.roles).includes("LM")) errors.lmId = "Pick a user with the Line manager role";
  if (v.buddyId) {
    if (!buddy) errors.buddyId = "Unknown buddy";
    else if (!buddy.buddyEligible) errors.buddyId = "That person is not buddy eligible";
    else if (buddy.id === v.lmId || buddy.id === v.existingUserId) errors.buddyId = "Buddy must be a different person from the starter and line manager";
  }
  if (v.existingUserId && !existing) errors.existingUserId = "Unknown starter";
  if (!v.existingUserId && v.upn && (await prisma.user.findUnique({ where: { upn: v.upn } }))) errors.upn = "That work email already exists. Pick the existing person instead.";
  if (existing && (await prisma.journey.findUnique({ where: { starterId: existing.id } }))) errors.existingUserId = "That person already has a journey";
  if (Object.keys(errors).length) throw new AdminError(400, "Validation failed", errors);

  let starterId = existing?.id;
  if (!existing) {
    starterId = `u-${randomUUID().slice(0, 8)}`;
    await prisma.user.create({
      data: { id: starterId, upn: v.upn!, displayName: v.displayName!, roles: ["STARTER"], teamId: v.teamId, reportsToId: v.lmId, teamRole: "Team member", jobFamily: v.jobFamily ?? null },
    });
    await audit(actorId, "ADMIN_USER_CREATED", "User", starterId, { roles: ["STARTER"], teamId: v.teamId });
  }
  const starter = (await prisma.user.findUnique({ where: { id: starterId! } }))!;
  if (existing && starter.teamId !== v.teamId) {
    await prisma.user.update({ where: { id: starter.id }, data: { teamId: v.teamId, reportsToId: v.lmId } });
    await audit(actorId, "ADMIN_USER_UPDATED", "User", starter.id, { teamId: v.teamId, reportsToId: v.lmId, previousTeamId: starter.teamId, previousReportsToId: starter.reportsToId, via: "seed-starter" });
  }

  const journey = await createJourneyForStarter({
    starterId: starter.id,
    lmId: v.lmId,
    buddyId: v.buddyId,
    teamId: v.teamId,
    startDate: new Date(`${v.startDate}T00:00:00.000Z`),
    actorId,
  });
  await audit(actorId, "ADMIN_STARTER_SEEDED", "Journey", journey.id, { starterId: starter.id }, journey.id);

  let identity: { ok: true; status: string } | { ok: false; message: string };
  if (opts.deferInvite) {
    // D19: the admin's browser sends the Graph invite and reports back via seed-starter/[journeyId]/invite-result.
    identity = { ok: true, status: "pending_graph" };
  } else try {
    const adapter = await getAdapter("identity");
    const r = await adapter.inviteGuest(journey.id, v.inviteEmail ?? starter.upn);
    identity = { ok: true, status: r.status };
    await audit(actorId, "INTEGRATION_STATUS", "Integration", "identity", { status: r.status }, journey.id);
    // The invite was sent, so complete `guest-invite-sent` (the engine writes the TASK_STATUS_CHANGED audit event).
    await completeGuestInviteTask(journey.id, { actorId }, r.status);
  } catch (e) {
    identity = { ok: false, message: e instanceof Error ? e.message : "Invite failed" };
    await audit(actorId, "INTEGRATION_FAILED", "Integration", "identity", { message: identity.message }, journey.id);
  }

  return {
    journeyId: journey.id,
    starterId: starter.id,
    starterName: starter.displayName,
    taskCount: journey.tasks.length,
    identity,
    links: { journey: "/journey", lm: `/lm/starters/${journey.id}` },
  };
}

/** Options for the seed form and edit pickers. */
export async function getDirectory() {
  const [users, teams, journeys] = await Promise.all([prisma.user.findMany({ orderBy: { displayName: "asc" } }), prisma.team.findMany({ orderBy: { name: "asc" } }), prisma.journey.findMany({ select: { starterId: true } })]);
  const withJourney = new Set(journeys.map((j) => j.starterId));
  return {
    teams: teams.map((t) => ({ id: t.id, name: t.name })),
    lms: users.filter((u) => parseRoles(u.roles).includes("LM")).map((u) => ({ id: u.id, name: u.displayName, teamId: u.teamId })),
    buddies: users.filter((u) => u.buddyEligible).map((u) => ({ id: u.id, name: u.displayName, teamId: u.teamId })),
    starters: users.filter((u) => parseRoles(u.roles).includes("STARTER") && !withJourney.has(u.id)).map((u) => ({ id: u.id, name: u.displayName, teamId: u.teamId })),
  };
}

// -------------------------------------------------------------- record exit

export async function listAdminJourneys() {
  const rows = await prisma.journey.findMany({ orderBy: { startDate: "asc" }, include: { team: true } });
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.starterId) } } });
  const accounts = await Promise.all(rows.map((j) => getWorkAccountStatus(j.id)));
  return rows.map((j, i) => ({
    workAccount: accounts[i],
    id: j.id,
    starterName: users.find((u) => u.id === j.starterId)?.displayName ?? j.starterId,
    teamName: j.team.name,
    startDate: j.startDate.toISOString(),
    stage: j.currentStage,
    status: j.status,
    exitReason: j.exitReason,
  }));
}

/** P&P or Admin records that a starter has left the journey. Calls journey-service.exitJourney. */
export async function recordExit(actorId: string, journeyId: string, input: unknown) {
  const v = parse(z.object({ reason: z.enum(EXIT_REASONS), note: z.string().trim().max(500).optional() }), input);
  const journey = await prisma.journey.findUnique({ where: { id: journeyId } });
  if (!journey) throw new NotFoundError("Journey not found");
  if (journey.status !== "active") throw new AdminError(409, "This journey is not active, so an exit cannot be recorded.");
  // D14: reasonSource and the optional note (as `comment`, which MI reads) go straight into the JOURNEY_EXITED event.
  await exitJourney(journeyId, v.reason, { actorId, data: { reasonSource: "PNP", ...(v.note ? { comment: v.note } : {}) } });
  return { ok: true, reason: v.reason };
}
