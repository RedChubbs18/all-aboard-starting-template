import { withRole } from "@/lib/auth/server";
import { canViewJourney } from "@/lib/auth/access";
import { loadJourney } from "@/server/journey-service";
import { getSimulationView } from "@/server/integration-service";
import { guarded } from "../http";

/** Mock state of every adapter for one journey: GET /api/simulate/state?journeyId=... */
export const GET = withRole(["ADMIN", "PNP"], (req, _ctx, user) =>
  guarded(async () => {
    const journeyId = new URL(req.url).searchParams.get("journeyId");
    if (!journeyId) return Response.json({ error: "invalid_body", message: "journeyId is required" }, { status: 400 });
    const j = await loadJourney(journeyId);
    if (!j || !canViewJourney(user, j)) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(await getSimulationView(journeyId));
  }),
);
