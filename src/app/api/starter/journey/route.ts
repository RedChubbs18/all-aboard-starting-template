import { withRole } from "@/lib/auth/server";
import type { JourneyResponse } from "@/components/journey/types";
import { buildJourneyDto } from "../_lib/dto";
import { otherJourneys, resolveJourney } from "../_lib/context";
import { guard } from "../_lib/http";

/**
 * The journey the viewer is looking at (FR-1.4): their own as a starter, or a visible one
 * (buddy: allocated starter, read-only; LM/P&P/admin: `?journeyId=`). Visibility is enforced
 * with canViewJourney; `canAct` per task comes from canActOnTask.
 */
export const GET = withRole(["STARTER", "BUDDY", "LM", "PNP", "ADMIN"], (req, _ctx, user) =>
  guard(async () => {
    const id = new URL(req.url).searchParams.get("journeyId");
    const journey = await resolveJourney(user, id);
    const body: JourneyResponse = {
      journey: await buildJourneyDto(journey, user),
      others: await otherJourneys(user, journey),
    };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  }),
);
