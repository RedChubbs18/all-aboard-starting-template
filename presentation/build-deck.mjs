// Builds onboarding-quest-deck.pptx (6 slides, 16:9) in the app's visual language.
// Run: node build-deck.mjs   (then: node validate-deck.mjs)
import pptxgen from "pptxgenjs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const LOGO = path.join(here, "assets", "lloyds-horse-180.png");
const OUT = path.join(here, "onboarding-quest-deck.pptx");

const C = {
  bg: "F4F4F4",
  panel: "E4E4E4",
  card: "FFFFFF",
  ink: "141414",
  muted: "5F5F5F",
  divider: "E6E6E6",
  green: "14B57A",
  onGreen: "0B1F17",
  black: "000000",
  white: "FFFFFF",
  joiner: "14A36B",
  manager: "D9472F",
  mixed: "2F6FD0",
  alertBg: "FDE7E1",
  alertInk: "7A1F10",
  gold: "E3A72F",
  // Light tints for owner pills (dark ink on top keeps contrast well above 4.5:1).
  joinerTint: "E2F4EC",
  managerTint: "FBE5E0",
  mixedTint: "E3ECFA",
};
const FONT = "Arial";
const CARD_R = 0.2; // same corner radius on every card
const M = 0.5; // outer margin
const SLIDE_W = 10;
const SLIDE_H = 5.625;

const pptx = new pptxgen();
pptx.layout = "LAYOUT_16x9"; // set before any slide is added
pptx.title = "Onboarding Quest";
pptx.author = "Launchpad hackathon team";

const SR = pptx.ShapeType;

function newSlide() {
  const s = pptx.addSlide();
  s.background = { color: C.bg };
  return s;
}

function addLogo(s) {
  s.addImage({ path: LOGO, x: 8.75, y: 0.3, w: 0.7, h: 0.7, objectName: "Logo" });
}

function addTitle(s, text) {
  s.addText(text, {
    objectName: "Title",
    x: M, y: 0.5, w: 7.9, h: 0.7,
    fontFace: FONT, fontSize: 32, bold: true, color: C.ink,
    align: "left", valign: "middle", margin: 0,
  });
}

function card(s, x, y, w, h, color = C.card, name = "Card") {
  s.addShape(SR.roundRect, {
    objectName: name, x, y, w, h,
    fill: { color }, line: { type: "none" }, rectRadius: CARD_R,
  });
}

function pill(s, x, y, w, h, color, name = "Pill") {
  s.addShape(SR.roundRect, {
    objectName: name, x, y, w, h,
    fill: { color }, line: { type: "none" }, rectRadius: h / 2,
  });
}

function dot(s, cx, cy, d, color, outline) {
  s.addShape(SR.ellipse, {
    objectName: "Dot", x: cx - d / 2, y: cy - d / 2, w: d, h: d,
    fill: { color }, line: outline ? { color: outline, width: 1.5 } : { type: "none" },
  });
}

function text(s, str, opts) {
  s.addText(str, { fontFace: FONT, color: C.ink, margin: 0, valign: "middle", ...opts });
}

// ---------- Slide 1: title ----------
{
  const s = newSlide();
  text(s, "Onboarding", { objectName: "Wordmark", x: M, y: 0.5, w: 4, h: 0.4, fontSize: 20, bold: true });
  addLogo(s);

  const cx = M, cy = 1.15, cw = 9.0, ch = 3.4;
  card(s, cx, cy, cw, ch, C.green, "Promo card");
  s.addText(
    [
      { text: "My Journey", options: { breakLine: true } },
      { text: "Onboarding Quest" },
    ],
    {
      objectName: "Title",
      x: cx + 0.45, y: cy + 0.35, w: 7.5, h: 1.45,
      fontFace: FONT, fontSize: 40, bold: true, color: C.onGreen,
      align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.0,
    },
  );
  text(s, "A clickable mock of the new starter journey.", {
    x: cx + 0.45, y: cy + 1.9, w: 7.5, h: 0.45, fontSize: 20, color: C.onGreen,
  });
  pill(s, cx + 0.45, cy + 2.6, 2.3, 0.48, C.black);
  text(s, "Hackathon demo", {
    x: cx + 0.45, y: cy + 2.6, w: 2.3, h: 0.48, fontSize: 16, bold: true, color: C.white, align: "center",
  });
  text(s, "Dummy data only, no live integrations.", {
    objectName: "Caption", x: M, y: cy + ch + 0.2, w: 6, h: 0.35, fontSize: 14, color: C.muted,
  });

  s.addNotes(
    "[About 30 seconds]\n\n" +
      "Good morning. We built a clickable mock of the onboarding journey, for the person starting a new job and the manager who looks after them. Everything in it is dummy data, and nothing connects to a real system. The PEV step is a placeholder until the provider is chosen, and the app links out to Workday rather than holding any personal data. I'll give you the problem, how it works, then show it live.",
  );
}

// ---------- Slide 2: the problem ----------
{
  const s = newSlide();
  addTitle(s, "The problem");
  addLogo(s);
  const points = [
    "Numerous platforms for onboarding activities",
    "Nobody sees the whole picture",
    "Numerous teams in contact with",
    "Emails back and forth",
    "Manager can't see when a new starter is stuck",
    "Complicated IT@LBG requests",
  ];
  const cols = 3, gap = 0.3, top = 1.5, bottom = SLIDE_H - M;
  const cw = (SLIDE_W - 2 * M - gap * (cols - 1)) / cols;
  const ch = (bottom - top - gap) / 2;
  points.forEach((p, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = M + col * (cw + gap), y = top + row * (ch + gap);
    card(s, x, y, cw, ch);
    dot(s, x + 0.35, y + ch / 2, 0.18, C.green);
    text(s, p, { x: x + 0.6, y: y + 0.15, w: cw - 0.85, h: ch - 0.3, fontSize: 18, bold: true });
  });
  s.addNotes(
    "[About 1 minute]\n\n" +
      "A new starter gets dozens of tasks from different teams: IT, HR, Payments and P&P. Nobody sees the whole list. IT@LBG requests are complicated, and emails go back and forth. The starter does not know what to do first, and the manager cannot see when someone is stuck. Ask the room: how many of you have chased someone for a laptop? Pause for a show of hands.",
  );
}

// ---------- Slide 3: the journey ----------
{
  const s = newSlide();
  addTitle(s, "One journey, five stages");
  addLogo(s);

  const x0 = 1.3, x1 = 8.7, trackH = 0.14, trackCy = 2.95;
  const progress = 0.19;
  const at = (p) => x0 + (x1 - x0) * p;
  // Track and green fill
  pill(s, x0, trackCy - trackH / 2, x1 - x0, trackH, C.panel, "Track");
  pill(s, x0, trackCy - trackH / 2, at(progress) - x0, trackH, C.green, "Track fill");

  const stages = ["Conditional Offer", "Vetting (PEV)", "Unconditional Offer", "Day 0", "Day 30"];
  stages.forEach((label, i) => {
    const cx = at(i / (stages.length - 1));
    const reached = i < 2;
    dot(s, cx, trackCy, 0.34, reached ? C.green : C.white, reached ? null : "B5B5B5");
    text(s, label, {
      x: cx - 0.8, y: trackCy + 0.32, w: 1.6, h: 0.65,
      fontSize: 16, bold: reached, align: "center", valign: "top",
      color: reached ? C.ink : C.muted,
    });
  });

  // Horse marker on the track at 19%, with a black pill above it
  const hx = at(progress);
  s.addImage({ path: LOGO, x: hx - 0.3, y: trackCy - 0.07 - 0.6, w: 0.6, h: 0.6, objectName: "Horse marker" });
  const pw = 1.9, ph = 0.42, py = trackCy - 0.07 - 0.6 - 0.12 - ph;
  pill(s, hx - pw / 2, py, pw, ph, C.black);
  text(s, "19% complete", { x: hx - pw / 2, y: py, w: pw, h: ph, fontSize: 16, bold: true, color: C.white, align: "center" });

  text(s, "Tasks in order, one step at a time.", { x: M, y: 4.35, w: 7.9, h: 0.45, fontSize: 20 });

  s.addNotes(
    "[About 1.5 minutes]\n\n" +
      "The journey runs in five stages. Conditional Offer covers the contract and team. Vetting, or PEV, is pre-employment vetting, where the starter gets reminders until it is complete. Unconditional Offer covers accounts, the Day 0 plan and the photo pass. Day 0 covers the desk, check-ins and goals. Day 30 covers the first month, including the 30-60-90 goals and stuck points. The horse moves along the track as tasks are completed. Think of it as a race: each completed task moves the horse on.",
  );
}

// ---------- Slide 4: who owns what ----------
{
  const s = newSlide();
  addTitle(s, "Every task has an owner");
  addLogo(s);
  const owners = [
    { label: "Joiner", dot: C.joiner, tint: C.joinerTint, line: "The new starter does it.", pw: 1.45 },
    { label: "Line manager", dot: C.manager, tint: C.managerTint, line: "The manager does it.", pw: 2.2 },
    { label: "Mixed", dot: C.mixed, tint: C.mixedTint, line: "Both do it together.", pw: 1.4 },
  ];
  const gap = 0.35, top = 1.55, ch = 2.35;
  const cw = (SLIDE_W - 2 * M - gap * 2) / 3;
  owners.forEach((o, i) => {
    const x = M + i * (cw + gap);
    card(s, x, top, cw, ch);
    const px = x + 0.35, py = top + 0.4, ph = 0.5;
    pill(s, px, py, o.pw, ph, o.tint, "Owner pill");
    dot(s, px + 0.3, py + ph / 2, 0.16, o.dot);
    text(s, o.label, { x: px + 0.5, y: py, w: o.pw - 0.6, h: ph, fontSize: 16, bold: true });
    text(s, o.line, { x: x + 0.35, y: top + 1.2, w: cw - 0.7, h: 0.8, fontSize: 20, valign: "top" });
  });
  text(s, "Tags follow the board. Some are still inferred and need checking.", {
    objectName: "Caption", x: M, y: top + ch + 0.45, w: 8.5, h: 0.4, fontSize: 14, color: C.muted,
  });
  s.addNotes(
    "[About 1 minute]\n\n" +
      "Every task carries a colour tag for who owns it. The board used stickies for this. Some tags are inferred from the wording and still need checking with the team. We show that in the app. The colours mean the same thing on every screen.",
  );
}

// ---------- Slide 5: the manager view ----------
{
  const s = newSlide();
  addTitle(s, "Managers see the whole intake");
  addLogo(s);
  const cx = M, cy = 1.5, cw = 9.0, ch = 2.5, pad = 0.3, gap = 0.3;
  card(s, cx, cy, cw, ch);
  const tiles = [
    { fig: "19%", label: "journey complete", bg: C.bg, ink: C.ink, lab: C.muted, bar: true },
    { fig: "1", label: "overdue", bg: C.alertBg, ink: C.alertInk, lab: C.alertInk },
    { fig: "1", label: "blocked", bg: C.alertBg, ink: C.alertInk, lab: C.alertInk },
    { fig: "2 of 4", label: "check-ins agreed", bg: C.bg, ink: C.ink, lab: C.muted },
  ];
  const tw = (cw - 2 * pad - gap * 3) / 4, th = ch - 2 * pad;
  tiles.forEach((t, i) => {
    const x = cx + pad + i * (tw + gap), y = cy + pad;
    card(s, x, y, tw, th, t.bg, "Tile");
    text(s, t.fig, { x: x + 0.25, y: y + 0.2, w: tw - 0.5, h: 0.65, fontSize: 36, bold: true, color: t.ink });
    text(s, t.label, { x: x + 0.25, y: y + 0.9, w: tw - 0.5, h: 0.6, fontSize: 16, color: t.lab, valign: "top" });
    if (t.bar) {
      const bx = x + 0.25, bw = tw - 0.5, by = y + th - 0.3;
      pill(s, bx, by, bw, 0.14, C.panel, "Track");
      pill(s, bx, by, bw * 0.19, 0.14, C.green, "Track fill");
    }
  });
  text(s, "New starters can only see their own tasks.", { x: M, y: cy + ch + 0.4, w: 8.5, h: 0.45, fontSize: 18, bold: true });
  s.addNotes(
    "[About 1.5 minutes]\n\n" +
      "The manager sees one starter's progress, their agreed check-ins and anything stuck, with chasers ready to send. New starters can only see their own tasks. Their manager's view is the next thing to show in the demo.",
  );
}

// ---------- Slide 6: handover to the demo ----------
{
  const s = newSlide();
  addLogo(s);
  const cx = M, cy = 1.15, cw = 9.0, ch = SLIDE_H - M - cy;
  card(s, cx, cy, cw, ch, C.green, "Promo card");
  s.addText("On to the demo", {
    objectName: "Title",
    x: cx + 0.55, y: cy + 0.5, w: cw - 1.1, h: ch - 1.0,
    fontFace: FONT, fontSize: 48, bold: true, color: C.onGreen, align: "center", valign: "middle", margin: 0,
  });
  s.addNotes(
    "[About 30 seconds, then about 6 minutes of live demo and questions]\n\n" +
      "I'll sign in as Jordan, who starts on Monday. Watch the horse move as I go. The biggest open decisions are the PEV provider, personal versus guest accounts for the Microsoft tenant, and what anchor days mean. Those are the questions we'd like your help with.\n\n" +
      "Open questions, if the room asks:\n" +
      "- Anchor days\n" +
      "- GE\n" +
      "- TB\n" +
      "- Epture\n" +
      "- P&P\n" +
      "- The blue \"mixed\" colour",
  );
}

await pptx.writeFile({ fileName: OUT });
console.log("Wrote", OUT);
