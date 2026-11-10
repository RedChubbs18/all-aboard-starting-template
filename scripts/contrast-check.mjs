#!/usr/bin/env node
// Asserts the WCAG 2.2 AA contrast pairings (docs/STYLE.md section 0) for every theme.
// Run: node scripts/contrast-check.mjs
// Token values are read from src/app/globals.css, so the check cannot drift from the real palette.
import { readFileSync, readdirSync, statSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function block(selector) {
  const start = css.indexOf(selector + " {");
  if (start < 0) throw new Error(`Missing block: ${selector}`);
  const end = css.indexOf("}", start);
  const vars = {};
  for (const m of css.slice(start, end).matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) vars[m[1]] = m[2];
  return vars;
}

const base = block("@theme");
const dark = { ...base, ...block('html[data-theme="dark"]') };
const high = { ...base, ...block('html[data-contrast="high"]') };
const darkHigh = { ...dark, ...high, ...block('html[data-theme="dark"][data-contrast="high"]') };
// In dark + high contrast the dark-theme values are the starting point, then the dark high-contrast block wins.
const themes = { light: base, dark, "high contrast": high, "dark high contrast": darkHigh };

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [description, foreground token, background token, minimum]. Tokens resolve per theme; "#rrggbb" literals are allowed.
const checks = [
  // Text, 4.5:1
  ["Ink on card", "ink", "card", 4.5],
  ["Ink on page", "ink", "page", 4.5],
  ["Muted on card", "muted", "card", 4.5],
  ["Muted on page", "muted", "page", 4.5],
  ["Muted on green tint", "muted", "brand-tint", 4.5],
  ["Muted on blocked tint", "muted", "blocked-tint", 4.5],
  ["Muted on mixed tint", "muted", "mixed-tint", 4.5],
  ["Card on ink (primary button)", "card", "ink", 4.5],
  ["Card on dark green (chips, toast, active fill)", "card", "dark-green", 4.5],
  ["Card on brand (logo placeholder, white text on brand fills)", "card", "brand", 4.5],
  ["Dark green on card (active nav label)", "dark-green", "card", 4.5],
  ["Brand strong on card (small green text, links)", "brand-strong", "card", 4.5],
  ["Brand strong on page", "brand-strong", "page", 4.5],
  ["Brand strong on green tint ('You' pill, success alert)", "brand-strong", "brand-tint", 4.5],
  ["Brand on card (percentage figure, brand text)", "brand", "card", 4.5],
  ["Blocked on card", "blocked", "card", 4.5],
  ["Blocked on page", "blocked", "page", 4.5],
  ["Blocked on blocked tint ('Your manager' pill, error alert)", "blocked", "blocked-tint", 4.5],
  ["Card on blocked (error toast)", "card", "blocked", 4.5],
  ["Mixed on mixed tint ('Shared' pill, info alert)", "mixed", "mixed-tint", 4.5],
  ["Mixed on card", "mixed", "card", 4.5],
  ["Automated on its tint ('Automated' pill)", "automated", "automated-tint", 4.5],
  ["Automated on page (locked stage reason)", "automated", "page", 4.5],
  ["Disabled text on disabled fill", "disabled-ink", "disabled", 4.5],
  ["Ink on page: text beside an active highlight", "ink", "brand-tint", 4.5],
  // Fixed pairs that do not change with the theme
  ["Black on accent #0be248 (accent button)", "accent-ink", "accent", 4.5],
  ["Focus-state text: white on black", "#ffffff", "#000000", 4.5],
  // Large text (24px regular or 18.7px bold), 3:1
  ["Brand on card (large percentage)", "brand", "card", 3],
  // Non-text, 3:1
  ["Focus outline on card", "focus", "card", 3],
  ["Focus outline on page", "focus", "page", 3],
  ["Focus halo against its outline", "focus", "focus-halo", 3],
  ["Brand fill/icon on card", "brand", "card", 3],
  ["Brand fill on page", "brand", "page", 3],
  ["Now ring on card", "now", "card", 3],
  ["Form control border on card", "line-strong", "card", 3],
  ["Form control border on page", "line-strong", "page", 3],
  ["Info icon on card", "info", "card", 3],
  ["Brand fill on bar track", "brand", "track", 3],
  ["Pending tick ring on card", "line-strong", "card", 3],
  ["Pending tick ring on page", "line-strong", "page", 3],
  // Fixed-background surface (camera viewfinder): these tokens are never overridden by a theme.
  ["Viewfinder text on viewfinder", "on-viewfinder", "viewfinder", 4.5],
  ["Viewfinder guide on viewfinder", "guide", "viewfinder", 3],
];

// Theme-specific extras
const featureOn = {
  light: ["ink", "feature"],
  dark: ["ink", "feature"],
  "high contrast": ["ink", "feature"],
  "dark high contrast": ["ink", "feature"],
};

let failed = 0;
let total = 0;
for (const [theme, t] of Object.entries(themes)) {
  const get = (k) => (k.startsWith("#") ? k : t[k]);
  const all = [...checks, ["Text on feature card ('Next step')", ...featureOn[theme], 4.5]];
  console.log(`\n== ${theme} ==`);
  for (const [name, fg, bg, min] of all) {
    const fgHex = get(fg);
    const bgHex = get(bg);
    if (!fgHex || !bgHex) throw new Error(`Unknown token in "${name}" (${fg} / ${bg})`);
    const r = ratio(fgHex, bgHex);
    const ok = r >= min;
    total++;
    if (!ok) failed++;
    if (!ok || process.env.VERBOSE !== "0") console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${name}`);
  }
}

// Fixed-surface tokens must be defined once (in @theme) and never overridden by a theme block.
for (const tok of ["viewfinder", "on-viewfinder", "guide"]) {
  total++;
  if ((css.match(new RegExp(`--color-${tok}:`, "g")) ?? []).length !== 1) {
    failed++;
    console.log(`FAIL  --color-${tok} must be defined once (in @theme) and not overridden by any theme`);
  } else console.log(`PASS  --color-${tok} is theme-independent`);
}

// Source scan: themed tokens flip with the theme, so they must not be used in a file that draws on the fixed viewfinder
// (text-card on #0d1512 was 1.13:1 in dark themes; border-focus is black in light themes). Use text-on-viewfinder / border-guide.
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = `${dir}/${f}`;
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") && !p.includes(".test.") ? [p] : [];
  });
}
for (const file of walk(new URL("../src/components", import.meta.url).pathname)) {
  const src = readFileSync(file, "utf8");
  if (!src.includes("bg-viewfinder")) continue;
  total++;
  const offenders = src.split("\n").filter((l) => /\b(text-card|border-focus)\b/.test(l));
  if (offenders.length) {
    failed++;
    console.log(`FAIL  ${file.split("/src/")[1]}: themed token on the viewfinder:\n${offenders.join("\n")}`);
  } else console.log(`PASS  ${file.split("/src/")[1]}: no text-card / border-focus on the viewfinder`);
}

// Known and accepted: information only.
const info = [
  ["Sage chart bar on card (value is always also written as text)", "sage", "card"],
  ["Brand fill on bar track (value is always also written as text)", "brand", "track"],
];
console.log("\n== information (not asserted, light theme) ==");
for (const [name, fg, bg] of info) console.log(`INFO  ${ratio(base[fg], base[bg]).toFixed(2).padStart(5)}:1  ${name}`);

if (failed) {
  console.error(`\n${failed} of ${total} pairing(s) below the minimum.`);
  process.exit(1);
}
console.log(`\nAll ${total} asserted pairings pass across ${Object.keys(themes).length} themes.`);
