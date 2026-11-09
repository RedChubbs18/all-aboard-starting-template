// Validates the synthetic content seed in content/seed/.
// Run: node content/seed/check.mjs   (exit code 1 on any failure)
// Checks: JSON parses, enums, unique keys, every reference resolves,
// dependency rules from docs/PLAN.md, FR coverage from docs/REQUIREMENTS.md §5,
// demo-scenario coverage, and a safety scan (example.test only, no GUIDs).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const errors = [];
const notes = [];
const fail = (msg) => errors.push(msg);

const DEMO_TODAY = '2026-11-09'; // fixed so the overdue check is deterministic

const STAGES = ['CONDITIONAL_OFFER', 'PEV', 'UNCONDITIONAL_OFFER', 'DAY_0', 'DAY_30'];
const CONTENT_TYPES = ['POLICY', 'BENEFIT', 'DEVICE_INFO', 'WORKSPACE_INFO', 'CONTRACT_RECAP', 'GUIDE', 'FLOOR_PLAN', 'VIDEO'];
const OWNERS = ['STARTER', 'LM', 'BUDDY', 'PNP', 'SYSTEM'];
const TASK_TYPES = ['INFO', 'ACTION', 'BOOKING', 'ORDER', 'INTEGRATION_STATUS', 'TRAINING', 'VIDEO', 'CHECKLIST'];
const SOURCES = ['CORE', 'TEAM', 'BESPOKE'];
const ADAPTERS = ['identity', 'sailpoint', 'firstadvantage', 'workday', 'itrequest', 'equipment', 'pass', 'booking', 'photocheck', 'notification'];
const ROLES = ['STARTER', 'BUDDY', 'LM', 'PNP', 'ADMIN'];
const TASK_STATUS = ['LOCKED', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'];
const JOURNEY_STATUS = ['active', 'completed', 'exited'];
const FIRSTADVANTAGE = ['NOT_STARTED', 'IN_PROGRESS', 'ACTION_NEEDED', 'CLEARED', 'FAILED'];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL = /^[a-z]+\.[a-z]+@example\.test$/;

// Every §5 FR. FEATURE_ONLY ones are behaviour, not a task, so no template is expected.
const FR_TASK_MAP = {
  'FR-1.1': ['guest-invite-sent', 'guest-sign-in'],
  'FR-1.2': ['say-hello-on-teams'],
  'FR-1.3': ['allocate-buddy', 'buddy-say-hello'],
  'FR-1.5': ['read-contract-recap'],
  'FR-1.6': ['read-workspace-info'],
  'FR-1.8': ['meet-your-team'],
  'FR-1.9': ['complete-vetting-steps'],
  'FR-2.1': ['read-policies-and-benefits'],
  'FR-2.2': ['pev-steps-reminder', 'complete-vetting-steps'],
  'FR-2.3': ['firstadvantage-vetting-status'],
  'FR-3.1': ['internal-account-created'],
  'FR-3.2': ['sailpoint-persona-applied'],
  'FR-3.3': ['colleague-file-id-created', 'raise-it-requests'],
  'FR-3.4': ['ms-password-authenticator-setup'],
  'FR-3.5': ['lm-team-checklist', 'team-github-access', 'team-azure-devops-access', 'team-distribution-lists', 'team-recurring-calls-list', 'team-welcome-message'],
  'FR-3.7': ['device-choice-submitted'],
  'FR-3.8': ['propose-day-0-arrangements', 'confirm-day-0-arrangements'],
  'FR-3.9': ['book-induction'],
  'FR-3.10': ['eptura-engage-access'],
  'FR-3.11': ['upload-pass-photo', 'order-photo-id-pass'],
  'FR-3.12': ['photo-check-passed', 'photo-check-override'],
  'FR-3.13': ['forward-team-calls', 'team-recurring-calls-list'],
  'FR-3.14': ['view-mandatory-training'],
  'FR-4.1': ['order-home-working-items'],
  'FR-4.2': ['review-flex-benefits'],
  'FR-4.3': ['mandatory-training-checklist'],
  'FR-4.4': ['find-your-way-on-day-one'],
  'FR-4.5': ['book-induction-fallback'],
  'FR-4.6': ['watch-executive-welcome'],
  'FR-4.7': ['agree-pre-start-check-ins', 'read-check-in-guide'],
  'FR-4.8': ['collect-equipment'],
  'FR-4.9': ['draft-30-60-90-goals', 'agree-30-60-90-goals'],
  'FR-5.1': ['cascade-performance-goals', 'read-performance-goals'],
  'FR-5.2': ['read-development-goals'],
};
const FEATURE_ONLY = {
  'FR-1.4': 'gamified track, rendered from task statuses',
  'FR-1.7': 'FAQ search and chatbot, not a task',
  'FR-3.6': 'LM bespoke tasks are created at runtime',
  'FR-LM.3': 'LM dashboard item, mapped to agree-pre-start-check-ins',
};
const FR_SECTION5 = [
  ...Array.from({ length: 9 }, (_, i) => `FR-1.${i + 1}`),
  ...Array.from({ length: 3 }, (_, i) => `FR-2.${i + 1}`),
  ...Array.from({ length: 14 }, (_, i) => `FR-3.${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `FR-4.${i + 1}`),
  'FR-5.1', 'FR-5.2',
];

function load(name) {
  try {
    return JSON.parse(readFileSync(join(dir, name), 'utf8'));
  } catch (e) {
    fail(`${name}: ${e.message}`);
    return null;
  }
}

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isStrArr = (v) => Array.isArray(v) && v.every((t) => typeof t === 'string');

// ---------- content.json ----------
const content = load('content.json');
const contentSlugs = new Set();
const contentBySlug = new Map();
if (!Array.isArray(content)) {
  fail('content.json must be an array');
} else {
  for (const [i, c] of content.entries()) {
    const where = `content.json[${i}] (${c?.slug ?? '?'})`;
    if (!c || typeof c !== 'object') { fail(`${where}: not an object`); continue; }
    if (!SLUG.test(c.slug ?? '')) fail(`${where}: slug must be kebab-case`);
    if (contentSlugs.has(c.slug)) fail(`${where}: duplicate slug`);
    contentSlugs.add(c.slug);
    contentBySlug.set(c.slug, c);
    if (!CONTENT_TYPES.includes(c.type)) fail(`${where}: bad type ${c.type}`);
    for (const f of ['title', 'summary', 'body']) if (!isStr(c[f])) fail(`${where}: ${f} missing`);
    if (c.stage !== undefined && !STAGES.includes(c.stage)) fail(`${where}: bad stage ${c.stage}`);
    if (!isStrArr(c.tags) || c.tags.length === 0) fail(`${where}: tags must be a non-empty string array`);
  }
  const recap = contentBySlug.get('contract-recap');
  if (!recap || !recap.body.includes('{{anchorDays}}')) fail('contract-recap must contain {{anchorDays}}');
}

// ---------- faqs.json ----------
const faqs = load('faqs.json');
const faqIds = new Set();
let faqWithSource = 0;
if (!Array.isArray(faqs)) {
  fail('faqs.json must be an array');
} else {
  for (const [i, f] of faqs.entries()) {
    const where = `faqs.json[${i}] (${f?.id ?? '?'})`;
    if (!isStr(f?.id)) fail(`${where}: id missing`);
    if (faqIds.has(f?.id)) fail(`${where}: duplicate id`);
    faqIds.add(f?.id);
    if (!isStr(f?.question) || !isStr(f?.answer)) fail(`${where}: question/answer missing`);
    if (!isStrArr(f?.tags) || f.tags.length === 0) fail(`${where}: tags must be a non-empty string array`);
    if (f?.sourceSlug !== undefined) {
      faqWithSource++;
      if (!contentSlugs.has(f.sourceSlug)) fail(`${where}: sourceSlug '${f.sourceSlug}' not in content.json`);
    }
  }
}

// ---------- templates.json ----------
const templates = load('templates.json');
const tplByKey = new Map();
const teamKeysFromPeople = new Set();
if (!Array.isArray(templates)) {
  fail('templates.json must be an array');
} else {
  for (const [i, t] of templates.entries()) {
    const where = `templates.json[${i}] (${t?.key ?? '?'})`;
    if (!t || typeof t !== 'object') { fail(`${where}: not an object`); continue; }
    if (!SLUG.test(t.key ?? '')) fail(`${where}: key must be kebab-case`);
    if (tplByKey.has(t.key)) fail(`${where}: duplicate key`);
    tplByKey.set(t.key, t);
    if (!isStr(t.title) || !isStr(t.description)) fail(`${where}: title/description missing`);
    if (!STAGES.includes(t.stage)) fail(`${where}: bad stage ${t.stage}`);
    if (!OWNERS.includes(t.owner)) fail(`${where}: bad owner ${t.owner}`);
    if (!TASK_TYPES.includes(t.type)) fail(`${where}: bad type ${t.type}`);
    if (!SOURCES.includes(t.source)) fail(`${where}: bad source ${t.source}`);
    if (!Number.isInteger(t.dueOffsetDays) || t.dueOffsetDays < -28 || t.dueOffsetDays > 30) {
      fail(`${where}: dueOffsetDays must be an integer from -28 to 30`);
    }
    if (!Array.isArray(t.dependsOn) || !t.dependsOn.every((d) => typeof d === 'string')) fail(`${where}: dependsOn must be an array`);
    if (typeof t.gating !== 'boolean') fail(`${where}: gating must be boolean`);
    if (t.adapterKey !== null && !ADAPTERS.includes(t.adapterKey)) fail(`${where}: bad adapterKey ${t.adapterKey}`);
    if (t.contentSlug !== null && !contentSlugs.has(t.contentSlug)) fail(`${where}: contentSlug '${t.contentSlug}' not in content.json`);
    if (t.condition !== null && !isStr(t.condition)) fail(`${where}: condition must be null or a string`);
    if (t.source === 'TEAM') {
      if (!isStr(t.teamKey)) fail(`${where}: TEAM template needs teamKey`);
    } else if (t.teamKey !== undefined) {
      fail(`${where}: teamKey only allowed on TEAM templates`);
    }
    if (t.owner === 'SYSTEM' && t.type !== 'INTEGRATION_STATUS' && t.type !== 'ORDER') {
      fail(`${where}: SYSTEM tasks should be INTEGRATION_STATUS or ORDER`);
    }
  }
  // dependsOn must resolve, no self-reference
  for (const t of tplByKey.values()) {
    for (const d of t.dependsOn ?? []) {
      if (d === t.key) fail(`templates: ${t.key} depends on itself`);
      if (!tplByKey.has(d)) fail(`templates: ${t.key} dependsOn unknown key '${d}'`);
    }
  }
  // cycle detection
  const state = new Map();
  const visit = (k, path) => {
    if (state.get(k) === 'done') return;
    if (state.get(k) === 'active') { fail(`templates: dependency cycle via ${[...path, k].join(' -> ')}`); return; }
    state.set(k, 'active');
    for (const d of tplByKey.get(k)?.dependsOn ?? []) if (tplByKey.has(d)) visit(d, [...path, k]);
    state.set(k, 'done');
  };
  for (const k of tplByKey.keys()) visit(k, []);

  // transitive ancestors
  const ancCache = new Map();
  const ancestors = (k) => {
    if (ancCache.has(k)) return ancCache.get(k);
    const out = new Set();
    for (const d of tplByKey.get(k)?.dependsOn ?? []) {
      out.add(d);
      for (const a of ancestors(d)) out.add(a);
    }
    ancCache.set(k, out);
    return out;
  };

  // PLAN.md dependency rules
  for (const t of tplByKey.values()) {
    if (t.adapterKey === 'itrequest' && !ancestors(t.key).has('colleague-file-id-created')) {
      fail(`dependency rule: ${t.key} (IT request) must depend on colleague-file-id-created`);
    }
  }
  const mustDepend = [
    ['order-photo-id-pass', ['photo-check-passed', 'confirm-day-0-arrangements']],
    ['photo-check-passed', ['upload-pass-photo']],
    ['collect-equipment', ['device-choice-submitted']],
    ['book-induction-fallback', ['book-induction']],
    ['team-recurring-calls-list', ['forward-team-calls']],
  ];
  for (const [k, reqs] of mustDepend) {
    for (const r of reqs) {
      if (!tplByKey.has(k) || !ancestors(k).has(r)) fail(`dependency rule: ${k} must depend on ${r}`);
    }
  }
  if (tplByKey.get('book-induction-fallback')?.condition !== 'induction-not-booked') {
    fail('book-induction-fallback must have condition induction-not-booked');
  }
  // gating for stage unlocks: every stage should have at least one gating task
  for (const s of STAGES) {
    const g = [...tplByKey.values()].filter((t) => t.stage === s && t.gating);
    if (g.length === 0 && s !== 'DAY_30') fail(`stage ${s} has no gating task`);
  }
  if (![...tplByKey.values()].some((t) => t.stage === 'DAY_30' && t.gating)) fail('DAY_30 needs gating tasks');

  // FR coverage
  const unmapped = [];
  for (const fr of FR_SECTION5) {
    if (FEATURE_ONLY[fr]) continue;
    const ks = FR_TASK_MAP[fr];
    if (!ks) { unmapped.push(fr); continue; }
    for (const k of ks) if (!tplByKey.has(k)) fail(`FR map: ${fr} expects template '${k}'`);
  }
  if (unmapped.length) fail(`FRs with no template mapping: ${unmapped.join(', ')}`);
  notes.push(`FR coverage: ${FR_SECTION5.length} FRs in §5, ${Object.keys(FR_TASK_MAP).length} mapped to templates, feature-only: ${Object.keys(FEATURE_ONLY).join(', ')}`);
  notes.push(`templates by source: ${JSON.stringify(countBy(templates, 'source'))}`);
}

// ---------- people.json ----------
const people = load('people.json');
const userByKey = new Map();
const teamByKey = new Map();
if (!people || typeof people !== 'object' || !Array.isArray(people.teams) || !Array.isArray(people.users) || !Array.isArray(people.journeys)) {
  fail('people.json must be an object with teams, users and journeys arrays');
} else {
  for (const t of people.teams) {
    if (!SLUG.test(t.key ?? '')) fail(`team key invalid: ${t.key}`);
    if (teamByKey.has(t.key)) fail(`duplicate team key ${t.key}`);
    if (!isStr(t.name) || !isStr(t.businessArea)) fail(`team ${t.key}: name and businessArea required`);
    teamByKey.set(t.key, t);
    teamKeysFromPeople.add(t.key);
  }
  for (const u of people.users) {
    if (!SLUG.test(u.key ?? '')) fail(`user key invalid: ${u.key}`);
    if (userByKey.has(u.key)) fail(`duplicate user key ${u.key}`);
    userByKey.set(u.key, u);
    if (!EMAIL.test(u.email ?? '')) fail(`user ${u.key}: email must be firstname.lastname@example.test`);
    if (!Array.isArray(u.roles) || !u.roles.every((r) => ROLES.includes(r))) fail(`user ${u.key}: bad roles`);
    if (u.teamKey !== null && !teamByKey.has(u.teamKey)) fail(`user ${u.key}: unknown teamKey ${u.teamKey}`);
    if (u.reportsToKey !== null && !(people.users.some((x) => x.key === u.reportsToKey))) fail(`user ${u.key}: unknown reportsToKey`);
    if (typeof u.buddyEligible !== 'boolean') fail(`user ${u.key}: buddyEligible must be boolean`);
    if (u.bio !== null && !isStr(u.bio)) fail(`user ${u.key}: bio must be string or null`);
    if (u.photo !== null) fail(`user ${u.key}: photo must be null in seed`);
  }
  for (const t of people.teams) {
    const lm = userByKey.get(t.lmKey);
    if (!lm) fail(`team ${t.key}: lmKey '${t.lmKey}' unknown`);
    else {
      if (!lm.roles.includes('LM')) fail(`team ${t.key}: lmKey user lacks LM role`);
      if (lm.teamKey !== t.key) fail(`team ${t.key}: LM is not in this team`);
    }
    const members = people.users.filter((u) => u.teamKey === t.key && !u.roles.includes('LM') && !u.roles.includes('STARTER'));
    if (members.length < 3 || members.length > 5) fail(`team ${t.key}: has ${members.length} members, need 3 to 5`);
  }
  const missingBios = people.users.filter((u) => u.teamKey && !u.roles.includes('STARTER') && !u.roles.includes('LM') && u.bio === null).map((u) => u.key);
  if (missingBios.length < 1 || missingBios.length > 2) fail(`expected one or two team members without a bio (FR-1.8 fallback), got ${missingBios.length}`);
  notes.push(`members without bio (FR-1.8 fallback): ${missingBios.join(', ')}`);

  const journeyStarters = new Set();
  const stageCounts = {};
  const starters = people.users.filter((u) => u.roles.includes('STARTER'));
  let sawActionNeeded = false;
  let sawOverdueLm = false;
  let sawExited = false;
  let sawCompleted = false;
  for (const j of people.journeys) {
    const where = `journey ${j.key}`;
    if (!SLUG.test(j.key ?? '')) fail(`${where}: key invalid`);
    const s = userByKey.get(j.starterKey);
    if (!s || !s.roles.includes('STARTER')) fail(`${where}: starterKey must be a STARTER user`);
    if (journeyStarters.has(j.starterKey)) fail(`${where}: starter has two journeys`);
    journeyStarters.add(j.starterKey);
    const lm = userByKey.get(j.lmKey);
    if (!lm || !lm.roles.includes('LM')) fail(`${where}: lmKey must be an LM`);
    const buddy = userByKey.get(j.buddyKey);
    if (!buddy || !buddy.buddyEligible) fail(`${where}: buddyKey must be buddy-eligible`);
    if (buddy && buddy.key === j.lmKey) fail(`${where}: buddy cannot be the LM`);
    if (buddy && buddy.teamKey !== j.teamKey) fail(`${where}: buddy must be in the journey team`);
    if (s && s.teamKey !== j.teamKey) fail(`${where}: starter teamKey differs from journey teamKey`);
    if (!teamByKey.has(j.teamKey)) fail(`${where}: unknown teamKey`);
    if (lm && teamByKey.get(j.teamKey)?.lmKey !== j.lmKey) fail(`${where}: lmKey is not the team LM`);
    if (!STAGES.includes(j.currentStage)) fail(`${where}: bad currentStage`);
    if (!JOURNEY_STATUS.includes(j.status)) fail(`${where}: bad status`);
    if (!FIRSTADVANTAGE.includes(j.firstAdvantageStatus)) fail(`${where}: bad firstAdvantageStatus`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j.startDate ?? '')) fail(`${where}: startDate must be YYYY-MM-DD`);
    if (j.status === 'exited') {
      sawExited = true;
      if (!isStr(j.exitReason) || !isStr(j.exitedAt)) fail(`${where}: exited journeys need exitReason and exitedAt`);
    }
    if (j.status === 'completed') {
      sawCompleted = true;
      if (j.currentStage !== 'DAY_30' || !isStr(j.completedAt)) fail(`${where}: completed journeys must be DAY_30 with completedAt`);
    }
    if (j.firstAdvantageStatus === 'ACTION_NEEDED') sawActionNeeded = true;
    stageCounts[j.currentStage] = (stageCounts[j.currentStage] ?? 0) + 1;
    for (const ts of j.taskStates ?? []) {
      const t = tplByKey.get(ts.templateKey);
      if (!t) fail(`${where}: taskStates unknown templateKey '${ts.templateKey}'`);
      if (!TASK_STATUS.includes(ts.status)) fail(`${where}: bad task status ${ts.status}`);
      if (ts.status === 'BLOCKED' && !isStr(ts.blockedReason)) fail(`${where}: BLOCKED task needs blockedReason`);
      if (t && t.owner === 'LM' && ts.status !== 'DONE' && j.startDate) {
        const due = addDays(j.startDate, t.dueOffsetDays);
        if (due < DEMO_TODAY) sawOverdueLm = true;
      }
    }
  }
  if (starters.length !== people.journeys.length) fail(`every starter needs one journey (${starters.length} starters, ${people.journeys.length} journeys)`);
  for (const st of STAGES) if (!stageCounts[st]) fail(`no journey currently at ${st}`);
  if (!sawActionNeeded) fail('demo needs a journey with firstAdvantageStatus ACTION_NEEDED');
  if (!sawOverdueLm) fail(`demo needs an LM task overdue as of ${DEMO_TODAY}`);
  if (!sawExited) fail('demo needs an exited journey');
  if (!sawCompleted) fail('demo needs a completed journey');
  const alex = people.journeys.find((j) => j.starterKey === 'alex-morgan');
  if (!alex || alex.currentStage !== 'CONDITIONAL_OFFER' || alex.teamKey !== 'dwe') fail('Alex Morgan must be in CONDITIONAL_OFFER on dwe');
  notes.push(`journeys by stage: ${JSON.stringify(stageCounts)}`);
  notes.push(`starters: ${starters.length}, journeys: ${people.journeys.length}, users: ${people.users.length}, teams: ${people.teams.length}`);
}

for (const t of templates ?? []) {
  if (t?.source === 'TEAM' && !teamKeysFromPeople.has(t.teamKey)) fail(`template ${t.key}: teamKey '${t.teamKey}' not in people.json`);
}

// ---------- safety scan over every seed file ----------
const allText = ['content.json', 'faqs.json', 'templates.json', 'people.json']
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');
for (const m of allText.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
  if (!m[0].endsWith('@example.test')) fail(`safety: non-placeholder email '${m[0]}'`);
}
for (const m of allText.matchAll(/https?:\/\/[^\s"')\]\\]+/g)) {
  let host = '';
  try { host = new URL(m[0]).hostname; } catch { host = ''; }
  if (host !== 'example.test' && !host.endsWith('.example.test')) fail(`safety: URL must be on example.test, found '${m[0]}'`);
}
if (/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.test(allText)) fail('safety: GUID-like value found');
const tokens = [...new Set(allText.match(/\{\{[A-Za-z]+\}\}/g) ?? [])];
notes.push(`placeholder tokens: ${tokens.join(', ') || 'none'}`);

// ---------- summary ----------
function countBy(arr, k) {
  return arr.reduce((acc, x) => ((acc[x[k]] = (acc[x[k]] ?? 0) + 1), acc), {});
}
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const counts = {
  'content.json items': Array.isArray(content) ? content.length : 0,
  'faqs.json FAQs': Array.isArray(faqs) ? faqs.length : 0,
  'faqs with sourceSlug': faqWithSource,
  'templates.json templates': Array.isArray(templates) ? templates.length : 0,
  'people.json teams': people?.teams?.length ?? 0,
  'people.json users': people?.users?.length ?? 0,
  'people.json journeys': people?.journeys?.length ?? 0,
};
console.log('Counts:');
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
for (const n of notes) console.log(`  ${n}`);

if (errors.length) {
  console.log(`\nFAILED with ${errors.length} problem(s):`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exitCode = 1;
} else {
  console.log('\nOK: all four files parse and every reference resolves.');
}
