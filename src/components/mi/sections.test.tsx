import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "@/server/db";
import { seedDatabase } from "@/server/seed";
import { getOverview, type Overview } from "@/server/mi-service";
import { AttritionSection } from "./AttritionSection";
import { FlowSection } from "./FlowSection";
import { IntakeSection } from "./IntakeSection";
import { LmSection } from "./LmSection";
import { MAJOR_FLAG_RULES } from "./rules";

let data: Overview;
const exportBtn = (type: string, label: string) => <button type="button" data-export={type}>{label}</button>;

beforeAll(async () => {
  await seedDatabase(prisma);
  // JSON round trip, as the browser sees it.
  data = JSON.parse(JSON.stringify(await getOverview({}, new Date("2026-11-10T10:00:00Z"))));
}, 60_000);

describe("MI sections render with the seeded synthetic history", () => {
  it("LM section shows the published flag rules, the league and a chase action, and the definitions disclosure", () => {
    const html = renderToStaticMarkup(<LmSection lm={data.lm} exportBtn={exportBtn} onChase={() => {}} />);
    for (const r of MAJOR_FLAG_RULES) expect(html).toContain(r.label);
    expect(html).toContain("How these numbers are calculated");
    expect(html).toContain("Chase LM");
    expect(html).toContain("<caption");
    expect(html).toContain('data-export="lm-league"');
    expect(html).toContain("Owen Placeholder");
  });

  it("attrition section shows text values, a table alternative toggle, the early warning list and the exit report", () => {
    const html = renderToStaticMarkup(<AttritionSection attrition={data.attrition} exits={data.exits} exportBtn={exportBtn} />);
    expect(html).toContain("Exits by month");
    expect(html).toContain("Show as table");
    expect(html).toContain("Early warning");
    expect(html).toContain("Exit report");
    expect(html).toMatch(/\d+% \(\d+ of \d+\)/);
    expect(html).toContain("How these numbers are calculated");
  });

  it("flow and intake sections render", () => {
    const flow = renderToStaticMarkup(<FlowSection data={data} exportBtn={exportBtn} empty={null} />);
    expect(flow).toContain("Tasks most often overdue or blocked");
    expect(flow).toContain("Vetting duration");
    expect(flow).toContain("90th percentile");
    const intake = renderToStaticMarkup(<IntakeSection intake={data.intake} exportBtn={exportBtn} />);
    expect(intake).toContain("Starters by start week");
    expect(intake).toContain("Behind");
    expect(intake).toContain("How these numbers are calculated");
  });
});
