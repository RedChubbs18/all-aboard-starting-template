#!/usr/bin/env node
/**
 * Map imported Entra test users onto seed personas.
 *
 * Usage: node scripts/map-entra-users.mjs <path-to-entra-users-export.csv>
 *
 * Export the users from Entra admin centre → Users → Download users (CSV). Rows whose
 * userPrincipalName starts with "team05-<persona-key>@" are matched to the persona with
 * that key in content/seed/people.json. The script writes prisma/seed.local.json, which is
 * git-ignored and must never be committed. Then run `npm run db:reset` to apply it.
 * It prints only persona keys and match counts, never IDs.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = process.argv[2];
if (!input || !existsSync(input)) {
  console.error("Usage: node scripts/map-entra-users.mjs <entra-users-export.csv>");
  process.exit(1);
}

// Minimal RFC 4180 CSV parser (handles quotes, commas and newlines in fields).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const rows = parseCsv(readFileSync(input, "utf8").replace(/^﻿/, ""));
const headerIndex = rows.findIndex((r) => r.some((h) => /userPrincipalName/i.test(h)));
if (headerIndex < 0) {
  console.error("Couldn't find a userPrincipalName column in that CSV.");
  process.exit(1);
}
const header = rows[headerIndex].map((h) => h.trim());
const upnCol = header.findIndex((h) => /userPrincipalName/i.test(h));
const idCol = header.findIndex((h) => /^(id|objectId|object id)$/i.test(h) || /\[(id|objectId)\]/i.test(h));
if (idCol < 0) {
  console.error("Couldn't find an id / objectId column in that CSV.");
  process.exit(1);
}

const people = JSON.parse(readFileSync(path.join(root, "content/seed/people.json"), "utf8"));
const personaKeys = new Set(people.users.map((u) => u.key));
const localPath = path.join(root, "prisma/seed.local.json");
const local = existsSync(localPath) ? JSON.parse(readFileSync(localPath, "utf8")) : { users: {} };
local.users ??= {};

const matched = [];
for (const r of rows.slice(headerIndex + 1)) {
  const upn = (r[upnCol] ?? "").trim();
  const oid = (r[idCol] ?? "").trim();
  const m = /^team05-([a-z0-9-]+)@/i.exec(upn);
  if (!m || !oid) continue;
  const key = m[1].toLowerCase();
  if (!personaKeys.has(key)) continue;
  local.users[key] = { entraOid: oid, upn };
  matched.push(key);
}

writeFileSync(localPath, JSON.stringify(local, null, 2) + "\n", { mode: 0o600 });
console.log(`Mapped ${matched.length} persona(s): ${matched.sort().join(", ") || "none"}`);
console.log("Wrote prisma/seed.local.json (git-ignored). Now run: npm run db:reset");
