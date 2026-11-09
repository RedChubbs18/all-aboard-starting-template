import { withRole } from "@/lib/auth/server";
import { overallPercent, tallyStages } from "@/components/journey/derive";
import type { BuddyResponse, BuddyStarterDto } from "@/components/journey/buddy-types";
import { taskVisibleInScope } from "@/lib/auth/access";
import { prisma } from "@/server/db";
import { listJourneys } from "@/server/journey-service";
import { toTaskDto } from "../_lib/dto";
import { guard } from "../_lib/http";

/**
 * F15 / F16 / D22: the buddy's view. One summary card per allocated starter (name, stage, progress %,
 * chat target) and, for the selected starter, ONLY the tasks the buddy owns. Starter task detail is never
 * returned: the filter is applied here, not in the browser.
 */
export const GET = withRole(["BUDDY"], (req, _ctx, user) =>
  guard(async () => {
    const journeys = await listJourneys({ buddyId: user.id });
    const people = await prisma.user.findMany({ where: { id: { in: journeys.map((j) => j.starterId) } } });
    const starters: BuddyStarterDto[] = journeys.map((j) => {
      const p = people.find((x) => x.id === j.starterId);
      return {
        journeyId: j.id,
        name: p?.displayName ?? "Starter",
        upn: p?.upn ?? "",
        stage: j.currentStage,
        status: j.status,
        progressPercent: overallPercent(tallyStages(j.tasks), j.currentStage, j.status),
        startDate: j.startDate.toISOString(),
      };
    });
    const rank = (s: BuddyStarterDto) => (s.status === "active" ? 0 : 1);
    starters.sort((a, b) => rank(a) - rank(b) || a.startDate.localeCompare(b.startDate));
    const asked = new URL(req.url).searchParams.get("journeyId");
    const selected = starters.find((s) => s.journeyId === asked) ?? starters[0] ?? null;
    const journey = selected ? journeys.find((j) => j.id === selected.journeyId)! : null;
    const tasks = journey
      ? journey.tasks.filter((t) => t.applicable && taskVisibleInScope("BUDDY", user, journey, t)).map((t) => toTaskDto(journey, t, user))
      : [];
    const body: BuddyResponse = { starters, selectedId: selected?.journeyId ?? null, tasks };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  }),
);
