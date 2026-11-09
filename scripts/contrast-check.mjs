#!/usr/bin/env node
// Asserts the WCAG 2.2 contrast pairings from docs/STYLE.md section A. Run: node scripts/contrast-check.mjs
// Colours mirror the tokens in src/app/globals.css.

const C = {
  page: "#f2f2f2",
  card: "#ffffff",
  ink: "#000000",
  muted: "#5a5f5c",
  line: "#e6e8e6",
  lineStrong: "#767d79",
  brand: "#12a872",
  brandStrong: "#0b6e4b",
  brandTint: "#e4f6ee",
  darkGreen: "#0b3b2b",
  feature: "#14a870",
  blocked: "#c0392b",
  blockedTint: "#fbe9e6",
  mixed: "#2a64a0",
  mixedTint: "#e5eef8",
  automated: "#3d4440",
  automatedTint: "#eceeed",
  track: "#dfe6e2",
  disabled: "#b8c5bf",
  disabledInk: "#3d4440",
  focus: "#9fd8c0",
  sage: "#8fc7a9",
};

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

// [description, foreground, background, minimum]
const checks = [
  // Text, 4.5:1
  ["Ink on white", C.ink, C.card, 4.5],
  ["Ink on page", C.ink, C.page, 4.5],
  ["Muted on white", C.muted, C.card, 4.5],
  ["Muted on page", C.muted, C.page, 4.5],
  ["White on dark green (chips, active nav fill)", C.card, C.darkGreen, 4.5],
  ["Dark green on white (active nav label)", C.darkGreen, C.card, 4.5],
  ["White on ink (primary button)", C.card, C.ink, 4.5],
  ["Deep green on white (small green text, links)", C.brandStrong, C.card, 4.5],
  ["Deep green on page", C.brandStrong, C.page, 4.5],
  ["Deep green on green tint ('You' pill)", C.brandStrong, C.brandTint, 4.5],
  ["Blocked red on white", C.blocked, C.card, 4.5],
  ["Blocked red on blocked tint ('Your manager' pill)", C.blocked, C.blockedTint, 4.5],
  ["White on blocked red (error toast)", C.card, C.blocked, 4.5],
  ["Mixed blue on mixed tint ('Shared' pill)", C.mixed, C.mixedTint, 4.5],
  ["Automated grey on its tint ('Automated' pill)", C.automated, C.automatedTint, 4.5],
  ["Ink on feature green (Next step card)", C.ink, C.feature, 4.5],
  ["Disabled text on disabled fill", C.disabledInk, C.disabled, 4.5],
  ["Locked stage reason text (automated grey) on the page-grey locked card", C.automated, C.page, 4.5],
  ["Muted on green tint (highlighted rows, 'Next step' tint)", C.muted, C.brandTint, 4.5],
  ["Muted on blocked tint", C.muted, C.blockedTint, 4.5],
  ["Muted on mixed tint", C.muted, C.mixedTint, 4.5],
  // Large text (at least 24px regular or 18.7px bold), 3:1
  ["Brand green on white (40px percentage)", C.brand, C.card, 3],
  ["White on brand green (20px bold logo placeholder)", C.card, C.brand, 3],
  // Non-text, 3:1
  ["Focus indicator: dark green outline on white", C.darkGreen, C.card, 3],
  ["Focus indicator: dark green outline on page", C.darkGreen, C.page, 3],
  ["Brand green icon/fill on white", C.brand, C.card, 3],
  ["Input/select/textarea border on white (--color-line-strong)", C.lineStrong, C.card, 3],
  ["Input/select/textarea border on page", C.lineStrong, C.page, 3],
];

// Known and accepted: shown for information only (not asserted).
const info = [
  ["Brand green on page (the 40px percentage always sits on a white card, never directly on the page)", C.brand, C.page],
  ["Focus halo #9fd8c0 on white (decorative; outline carries the 3:1)", C.focus, C.card],
  ["Brand fill on bar track (value is always also written as text)", C.brand, C.track],
  ["Sage chart bar on white (value is always also written as text)", C.sage, C.card],
];

let failed = 0;
for (const [name, fg, bg, min] of checks) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${name}`);
}
for (const [name, fg, bg] of info) console.log(`INFO  ${ratio(fg, bg).toFixed(2).padStart(5)}:1  ${name}`);

if (failed) {
  console.error(`\n${failed} pairing(s) below the minimum.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} asserted pairings pass.`);
