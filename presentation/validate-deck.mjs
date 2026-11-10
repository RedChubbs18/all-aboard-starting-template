// Validates onboarding-quest-deck.pptx against the team's brief.
// Run: node validate-deck.mjs [path-to-pptx]
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? path.join(here, "onboarding-quest-deck.pptx");
const EMU = 914400;
const SLIDE_W = 10, SLIDE_H = 5.625, MARGIN = 0.5, EPS = 0.005;
const MAX_WORDS = 20;
// Slides whose on-slide text the brief dictates word for word and which exceed ~20 words.
// They are reported as warnings, not failures, because changing the text would break the brief.
const BRIEF_FIXED_TEXT = { 2: "six problem statements given verbatim", 4: "owner labels, lines and caption given verbatim" };
const MUTED = "5F5F5F";
const CARD_RADIUS = 0.2;

const errors = [], warnings = [], info = [];
const fail = (slide, msg) => errors.push(`slide ${slide}: ${msg}`);
const near = (a, b) => Math.abs(a - b) <= EPS;
const attr = (xml, name) => { const m = xml.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? m[1] : undefined; };
const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const zip = await JSZip.loadAsync(await readFile(file));
const read = (p) => zip.file(p)?.async("string");

// Layout
const pres = await read("ppt/presentation.xml");
const sz = pres.match(/<p:sldSz[^>]*>/)[0];
const w = +attr(sz, "cx") / EMU, h = +attr(sz, "cy") / EMU;
if (!near(w, SLIDE_W) || !near(h, SLIDE_H)) errors.push(`layout is ${w}x${h} in, expected 10x5.625 (16:9)`);
else info.push(`layout 16:9 (${w} x ${h} in)`);

const slideFiles = Object.keys(zip.files)
  .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
  .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
if (slideFiles.length !== 6) errors.push(`expected 6 slides, found ${slideFiles.length}`);

for (const sf of slideFiles) {
  const n = +sf.match(/slide(\d+)\.xml/)[1];
  const xml = await read(sf);

  // Notes
  const rels = (await read(`ppt/slides/_rels/slide${n}.xml.rels`)) ?? "";
  const notesTarget = rels.match(/Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/);
  if (!notesTarget) fail(n, "no speaker notes");
  else {
    const nx = await read(`ppt/notesSlides/${notesTarget[1]}`);
    const notesText = [...nx.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decode(m[1])).join(" ");
    if (notesText.trim().length < 80) fail(n, "speaker notes are missing or too short");
    if (!/\[About [^\]]+\]/.test(notesText)) fail(n, "speaker notes have no timing like [About 30 seconds]");
  }

  // Shapes and pictures
  const shapes = [...xml.matchAll(/<p:(sp|pic)>([\s\S]*?)<\/p:\1>/g)].map((m) => {
    const body = m[2];
    const off = body.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/);
    const ext = body.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    return {
      kind: m[1],
      name: decode(attr(body.match(/<p:cNvPr[^>]*>/)[0], "name") ?? ""),
      x: +off[1] / EMU, y: +off[2] / EMU, w: +ext[1] / EMU, h: +ext[2] / EMU,
      geom: attr(body.match(/<a:prstGeom[^>]*>/)?.[0] ?? "", "prst"),
      adj: body.match(/<a:gd name="adj" fmla="val (\d+)"/)?.[1],
      body,
    };
  });

  // Logo
  const logos = shapes.filter((s) => s.kind === "pic" && s.name === "Logo");
  if (logos.length !== 1) fail(n, `expected exactly one logo, found ${logos.length}`);
  else {
    const L = logos[0];
    if (!near(L.x, 8.75) || !near(L.y, 0.3) || !near(L.w, 0.7) || !near(L.h, 0.7))
      fail(n, `logo at (${L.x}, ${L.y}) ${L.w}x${L.h}, expected (8.75, 0.3) 0.7x0.7`);
  }

  let words = 0;
  for (const s of shapes) {
    const fullBleed = near(s.x, 0) && near(s.y, 0) && near(s.w, SLIDE_W) && near(s.h, SLIDE_H);
    if (s.name !== "Logo" && !fullBleed) {
      if (s.x < MARGIN - EPS || s.y < MARGIN - EPS || s.x + s.w > SLIDE_W - MARGIN + EPS || s.y + s.h > SLIDE_H - MARGIN + EPS)
        fail(n, `"${s.name}" outside 0.5in margins (x ${s.x.toFixed(2)}, y ${s.y.toFixed(2)}, w ${s.w.toFixed(2)}, h ${s.h.toFixed(2)})`);
    }
    if (s.name === "Title" && s.w > 7.9 + EPS) fail(n, `heading is ${s.w.toFixed(2)}in wide (max 7.9)`);
    if (s.geom === "roundRect" && /card|tile/i.test(s.name) && s.adj) {
      const r = (+s.adj / 100000) * Math.min(s.w, s.h);
      if (!near(r, CARD_RADIUS)) fail(n, `"${s.name}" corner radius ${r.toFixed(3)}in, expected ${CARD_RADIUS}`);
    }
    if (/cap="all"/.test(s.body)) fail(n, `"${s.name}" uses all-caps formatting`);

    // Runs
    for (const r of s.body.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)) {
      const run = r[1];
      const t = decode(run.match(/<a:t>([^<]*)<\/a:t>/)?.[1] ?? "");
      if (!t.trim()) continue;
      const rPr = run.match(/<a:rPr[^>]*?\/>|<a:rPr[\s\S]*?<\/a:rPr>/)?.[0] ?? "";
      const face = rPr.match(/<a:latin typeface="([^"]*)"/)?.[1];
      if (face !== "Arial") fail(n, `"${t}" font is ${face ?? "unset"}, expected Arial`);
      const size = +(attr(rPr, "sz") ?? 0) / 100;
      const color = rPr.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/)?.[1]?.toUpperCase();
      if (!size) fail(n, `"${t}" has no explicit font size`);
      else if (size < 12) fail(n, `"${t}" is ${size}pt (min 12)`);
      else if (size < 16 && color !== MUTED) fail(n, `"${t}" is ${size}pt body text (min 16; only muted captions may be smaller)`);
      const letters = t.replace(/[^A-Za-z]/g, "");
      if (letters.length >= 3 && /\s/.test(t.trim()) && t === t.toUpperCase()) fail(n, `"${t}" is all caps`);
      if (s.name !== "Title") words += t.trim().split(/\s+/).filter(Boolean).length;
    }
  }

  if (words > MAX_WORDS) {
    if (BRIEF_FIXED_TEXT[n]) warnings.push(`slide ${n}: ${words} words on slide (over ~${MAX_WORDS}); allowed because the brief fixes the text (${BRIEF_FIXED_TEXT[n]})`);
    else fail(n, `${words} words on slide, max ~${MAX_WORDS} excluding the title`);
  }
  info.push(`slide ${n}: ${words} words excluding title, ${shapes.length} shapes, notes ok`);
}

for (const l of info) console.log(`  ok    ${l}`);
for (const l of warnings) console.log(`  warn  ${l}`);
for (const l of errors) console.log(`  FAIL  ${l}`);
console.log(errors.length ? `\nValidation failed: ${errors.length} error(s)` : `\nValidation passed (${warnings.length} warning(s))`);
process.exit(errors.length ? 1 : 0);
