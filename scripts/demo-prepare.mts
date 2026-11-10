/**
 * Stage the running apps for the Team 05 live demo. Idempotent; safe while both dev servers run.
 *
 *   npm run demo:prepare
 *
 * Purges mock Workday's offers (the same files `npm run reset` removes there), reseeds MyJourney in place, stages
 * Alex at Day 0, and prints a checklist. Sends no email and no invitations. Prints no secrets.
 */
import { rmSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/server/db";
import { prepareDemoData } from "../src/server/demo-prepare";

const WORKDAY_DATA = path.join(process.cwd(), "demo", "mock-workday", ".data");

async function main() {
  const lines: string[] = [];
  const tick = (m: string) => lines.push(`  [ok] ${m}`);

  rmSync(WORKDAY_DATA, { recursive: true, force: true });
  tick("Mock Workday offers purged (demo/mock-workday/.data)");

  const s = await prepareDemoData({ log: (m) => tick(m) });
  const a = s.alex;
  tick(`Alex Morgan: stage ${a.stage}, start date ${a.startDate} (today)`);
  tick(`Alex device: ${a.device ?? "NONE"}${a.peripherals.length ? ` + ${a.peripherals.join(", ")}` : ""}; induction ${a.induction ? "booked" : "NOT booked"}; photo pass ${a.passOrdered ? "ordered" : "NOT ordered"}`);
  tick(a.day0 ? `Day 0 arrangement ${a.day0.confirmed ? "proposed by Dana and confirmed by Alex" : "PROPOSED ONLY"}: ${a.day0.where}, ${a.day0.who}` : "Day 0 arrangement MISSING");
  tick(`Open Day 0 tasks for Alex: ${a.openDay0Tasks.map((t) => `${t.title} [${t.status}]`).join("; ") || "none"}`);
  tick(`Dana's list: ${s.dana.starters} active starters`);
  tick(`MI: ${s.mi.majorFlags} major flags (${s.mi.flaggedLms.join(", ") || "none"}); chase-able LMs: ${s.mi.chaseableLms.join(", ") || "none"}`);

  const bad = a.stage !== "DAY_0" || !a.device || !a.day0?.confirmed || s.mi.majorFlags < 1 || !s.mi.chaseableLms.length || s.dana.starters < 1;
  console.log("\nDemo staging checklist");
  console.log(lines.join("\n"));
  console.log(bad ? "\nPROBLEM: something above is not as expected." : "\nReady. Remaining by hand: see docs/DEMO-SCRIPT.md (pre-flight checklist).");
  if (bad) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("demo:prepare failed:", e instanceof Error ? e.message : "error");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
