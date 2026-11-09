/**
 * Seed loader. Reads content/seed/*.json (validated by zod) and falls back to
 * prisma/fixtures/*.json for files that are missing. Optional prisma/seed.local.json
 * maps seeded users (by key) to real Entra oids/UPNs and is gitignored.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { ZodType } from "zod";
import {
  contentFileSchema,
  faqsFileSchema,
  peopleFileSchema,
  seedLocalSchema,
  templatesFileSchema,
  toTemplateInput,
  type SeedPeople,
} from "@/domain/seed-schema";
import { createJourney, recomputeTasks, refreshFlag } from "@/domain/engine";
import { STAGES, stageIndex, type NewEvent, type TaskState, type TemplateInput } from "@/domain/types";
import { eventData, persistEngineResult } from "./journey-service";

const ROOT = process.cwd();
const SEED_DIR = path.join(ROOT, "content", "seed");
const FIXTURE_DIR = path.join(ROOT, "prisma", "fixtures");
const LOCAL_FILE = path.join(ROOT, "prisma", "seed.local.json");

function readJson<T>(file: string, schema: ZodType<T>, label: string): T {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const r = schema.safeParse(raw);
  if (!r.success) {
    const issues = r.error.issues.slice(0, 10).map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid ${label} (${file}):\n${issues}`);
  }
  return r.data;
}

export interface SeedSources {
  content: string;
  faqs: string;
  templates: string;
  people: string;
}

function pick(name: string) {
  const real = path.join(SEED_DIR, `${name}.json`);
  return existsSync(real) ? real : path.join(FIXTURE_DIR, `${name}.json`);
}

/** templates + people reference each other, so they come from the same source (real or fixture). */
export function resolveSources(): SeedSources {
  const t = pick("templates");
  const p = pick("people");
  const bothReal = t.startsWith(SEED_DIR) && p.startsWith(SEED_DIR);
  return {
    content: pick("content"),
    faqs: pick("faqs"),
    templates: bothReal ? t : path.join(FIXTURE_DIR, "templates.json"),
    people: bothReal ? p : path.join(FIXTURE_DIR, "people.json"),
  };
}

const DAY = 86_400_000;

export async function seedDatabase(prisma: PrismaClient, log: (m: string) => void = () => {}) {
  const src = resolveSources();
  log(`content: ${path.relative(ROOT, src.content)}`);
  log(`faqs: ${path.relative(ROOT, src.faqs)}`);
  log(`templates: ${path.relative(ROOT, src.templates)}`);
  log(`people: ${path.relative(ROOT, src.people)}`);
  const content = readJson(src.content, contentFileSchema, "content.json");
  const faqs = readJson(src.faqs, faqsFileSchema, "faqs.json");
  const templates = readJson(src.templates, templatesFileSchema, "templates.json");
  const people: SeedPeople = readJson(src.people, peopleFileSchema, "people.json");
  const local = process.env.SEED_SKIP_LOCAL !== "1" && existsSync(LOCAL_FILE) ? readJson(LOCAL_FILE, seedLocalSchema, "seed.local.json") : null;

  // Referential checks (fail loudly rather than seed a broken graph).
  const tkeys = new Set(templates.map((t) => t.key));
  if (tkeys.size !== templates.length) throw new Error("templates.json has duplicate keys");
  for (const t of templates) for (const d of t.dependsOn) if (!tkeys.has(d)) throw new Error(`Template ${t.key} depends on unknown key ${d}`);
  const teamKeys = new Set(people.teams.map((t) => t.key));
  const userKeys = new Set(people.users.map((u) => u.key));
  for (const t of templates) {
    const tk = t.teamKey ?? t.teamId;
    if (tk && !teamKeys.has(tk)) throw new Error(`Template ${t.key} references unknown team ${tk}`);
  }
  for (const u of people.users) {
    if (u.teamKey && !teamKeys.has(u.teamKey)) throw new Error(`User ${u.key}: unknown team ${u.teamKey}`);
    if (u.reportsToKey && !userKeys.has(u.reportsToKey)) throw new Error(`User ${u.key}: unknown reportsTo ${u.reportsToKey}`);
  }
  for (const j of people.journeys) {
    for (const k of [j.starterKey, j.lmKey, j.buddyKey]) if (k && !userKeys.has(k)) throw new Error(`Journey ${j.key}: unknown user ${k}`);
    if (!teamKeys.has(j.teamKey)) throw new Error(`Journey ${j.key}: unknown team ${j.teamKey}`);
    for (const s of j.taskStates) if (!tkeys.has(s.templateKey)) throw new Error(`Journey ${j.key}: unknown template ${s.templateKey}`);
  }

  // Wipe (children first).
  await prisma.$transaction([
    prisma.event.deleteMany(), prisma.integrationState.deleteMany(), prisma.goal.deleteMany(),
    prisma.checkIn.deleteMany(), prisma.day0Arrangement.deleteMany(), prisma.task.deleteMany(),
    prisma.journey.deleteMany(), prisma.taskTemplate.deleteMany(), prisma.user.deleteMany(),
    prisma.team.deleteMany(), prisma.contentItem.deleteMany(), prisma.faq.deleteMany(),
    prisma.adapterConfig.deleteMany(),
  ]);

  for (const t of people.teams) {
    await prisma.team.create({ data: { id: t.key, name: t.name, area: t.businessArea ?? null, lmId: t.lmKey ?? null } });
  }
  for (const u of people.users) {
    const o = local?.users[u.key];
    await prisma.user.create({
      data: {
        id: u.key, upn: o?.upn ?? u.email, entraOid: o?.entraOid ?? null, displayName: u.name, roles: u.roles,
        teamId: u.teamKey ?? null, teamRole: u.teamRole ?? null, jobTitle: u.jobTitle ?? null,
        photoUrl: u.photo ?? null, bio: u.bio ?? null, buddyEligible: u.buddyEligible,
      },
    });
  }
  for (const u of people.users) {
    if (u.reportsToKey) await prisma.user.update({ where: { id: u.key }, data: { reportsToId: u.reportsToKey } });
  }
  for (const c of content) {
    await prisma.contentItem.create({ data: { slug: c.slug, type: c.type, title: c.title, summary: c.summary, body: c.body, stage: c.stage ?? null, tags: c.tags } });
  }
  for (const f of faqs) {
    await prisma.faq.create({ data: { id: f.id, question: f.question, answer: f.answer, tags: f.tags, sourceSlug: f.sourceSlug ?? null } });
  }
  const tplRows: TemplateInput[] = [];
  for (const [i, t] of templates.entries()) {
    const ti = toTemplateInput({ ...t, sortOrder: t.sortOrder ?? i });
    const row = await prisma.taskTemplate.create({
      data: { ...ti, dependsOn: ti.dependsOn, description: ti.description ?? "", sortOrder: ti.sortOrder ?? i, id: undefined },
    });
    tplRows.push({ ...ti, id: row.id });
  }

  const now = new Date();
  for (const j of people.journeys) {
    const k = stageIndex(j.currentStage);
    const base = new Date(now.getTime() - (k + 1) * 4 * DAY); // synthetic history for MI time-in-stage
    const created = createJourney(tplRows, {
      id: j.key, starterId: j.starterKey, lmId: j.lmKey, buddyId: j.buddyKey ?? null, teamId: j.teamKey,
      startDate: new Date(j.startDate), now: base,
    });
    let jr = created.journey;
    const overrides = new Map(j.taskStates.map((s) => [s.templateKey, s]));
    const doneAt = (t: TaskState) => new Date(Math.min(now.getTime(), t.dueDate.getTime()));
    const tasks: TaskState[] = jr.tasks.map((t) => {
      const o = overrides.get(t.key);
      const allDone = j.status === "completed" || stageIndex(t.stage) < k;
      if (o) {
        return {
          ...t, status: o.status, completedAt: o.status === "DONE" ? doneAt(t) : null,
          blockedReason: o.status === "BLOCKED" ? (o.blockedReason ?? "Action needed") : null,
        };
      }
      return allDone ? { ...t, status: "DONE", completedAt: doneAt(t) } : t;
    });
    jr = {
      ...jr, tasks, currentStage: j.currentStage, status: j.status,
      exitReason: j.status === "exited" ? (j.exitReason ?? "WITHDRAWN") : null,
      exitStage: j.status === "exited" ? j.currentStage : null,
      completedAt: j.status === "completed" ? new Date(j.completedAt ?? now) : null,
    };
    jr = recomputeTasks(jr, { now }).journey;
    jr = refreshFlag(jr, { now }).journey;

    const events: NewEvent[] = [...created.events];
    for (let i = 1; i <= k; i++) {
      events.push({
        journeyId: jr.id, actorId: null, type: "STAGE_CHANGED", entity: "Journey", entityId: jr.id,
        from: STAGES[i - 1], to: STAGES[i], data: { reason: "seed" },
        createdAt: new Date(base.getTime() + i * 4 * DAY),
      });
    }
    if (jr.status === "exited") {
      events.push({ journeyId: jr.id, actorId: null, type: "JOURNEY_EXITED", entity: "Journey", entityId: jr.id, from: "active", to: "exited", data: { reason: jr.exitReason, stage: jr.exitStage }, createdAt: new Date(j.exitedAt ?? now) });
    }
    if (jr.status === "completed") {
      events.push({ journeyId: jr.id, actorId: null, type: "JOURNEY_COMPLETED", entity: "Journey", entityId: jr.id, from: "active", to: "completed", data: null, createdAt: jr.completedAt ?? now });
    }
    if (jr.flagged) {
      events.push({ journeyId: jr.id, actorId: null, type: "JOURNEY_FLAGGED", entity: "Journey", entityId: jr.id, from: "false", to: "true", data: { reason: jr.flagReason }, createdAt: now });
    }
    await prisma.$transaction(async (tx) => {
      await persistEngineResult(tx, null, { journey: jr, events: [] });
      await tx.event.createMany({ data: events.map((e) => eventData(e)) as Prisma.EventCreateManyInput[] });
      if (j.firstAdvantageStatus) {
        await tx.integrationState.create({ data: { journeyId: jr.id, adapterKey: "firstadvantage", status: j.firstAdvantageStatus.toLowerCase(), payload: {} } });
      }
    });
  }
  return { teams: people.teams.length, users: people.users.length, templates: templates.length, journeys: people.journeys.length, content: content.length, faqs: faqs.length };
}
