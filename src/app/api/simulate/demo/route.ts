import { z } from "zod";
import { withRole } from "@/lib/auth/server";
import { canViewJourney } from "@/lib/auth/access";
import { loadJourney } from "@/server/journey-service";
import { DEMO_STEPS, demoJourneyId, runDemoStep } from "@/server/integration-service";
import { guarded, readJson } from "../http";

const body = z.object({ step: z.enum(DEMO_STEPS), journeyId: z.string().min(1).optional() });

/** One-click demo script steps (REQUIREMENTS section 12). Defaults to the demo starter, alex-morgan. */
export const POST = withRole(["ADMIN", "PNP"], (req, _ctx, user) =>
  guarded(async () => {
    const b = await readJson(req, body);
    if (b instanceof Response) return b;
    const journeyId = b.journeyId ?? (await demoJourneyId());
    const j = await loadJourney(journeyId);
    if (!j || !canViewJourney(user, j)) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(await runDemoStep(b.step, { actorId: user.id }, journeyId));
  }),
);
