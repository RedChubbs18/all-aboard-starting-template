import { z } from "zod";
import { withRole } from "@/lib/auth/server";
import { canViewJourney, journeyScopeWhere } from "@/lib/auth/access";
import { ADAPTER_KEYS } from "@/domain/types";
import { loadJourney, listJourneys } from "@/server/journey-service";
import { simulate, isDemoJourney, DEMO_STARTER_ID } from "@/server/integration-service";
import { prisma } from "@/server/db";
import { guarded, readJson } from "./http";

/** FR-AD.4: journeys that can be simulated against. ADMIN and PNP only. */
export const GET = withRole(["ADMIN", "PNP"], async (_req, _ctx, user) => {
  const journeys = await listJourneys({ AND: [journeyScopeWhere(user), { status: "active" }] });
  const people = await prisma.user.findMany({ where: { id: { in: journeys.map((j) => j.starterId) } } });
  const demo = new Set<string>();
  for (const j of journeys) if (await isDemoJourney(j.id)) demo.add(j.id);
  return Response.json({
    demoStarterId: DEMO_STARTER_ID,
    journeys: journeys.map((j) => ({
      demo: demo.has(j.id),
      id: j.id,
      starterId: j.starterId,
      starter: people.find((p) => p.id === j.starterId)?.displayName ?? j.starterId,
      stage: j.currentStage,
      flagged: j.flagged,
    })),
  });
});

const body = z.object({
  adapterKey: z.enum(ADAPTER_KEYS),
  journeyId: z.string().min(1),
  status: z.string().min(1).max(64),
  detail: z.string().max(300).optional(),
});

/** Simulate an external event, e.g. { adapterKey: "firstadvantage", journeyId, status: "cleared" }. */
export const POST = withRole(["ADMIN", "PNP"], (req, _ctx, user) =>
  guarded(async () => {
    const b = await readJson(req, body);
    if (b instanceof Response) return b;
    const j = await loadJourney(b.journeyId);
    if (!j || !canViewJourney(user, j)) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(await simulate(b.adapterKey, b.journeyId, b.status, b.detail, { actorId: user.id }));
  }),
);
