import { withRole } from "@/lib/auth/server";
import { formatDays } from "@/lib/markdown";
import { getAdapter } from "@/adapters/registry";
import { resolveJourney } from "../_lib/context";
import { guard } from "../_lib/http";

/** FR-1.5: the starter's anchor days from WorkdayAdapter, used to fill {{anchorDays}} on content pages. */
export const GET = withRole(["STARTER", "BUDDY", "LM", "PNP", "ADMIN"], (req, _ctx, user) =>
  guard(async () => {
    const journey = await resolveJourney(user, new URL(req.url).searchParams.get("journeyId"));
    const wd = await getAdapter("workday");
    const { days, location } = await wd.getAnchorDays(journey.id);
    return Response.json({ days, location, text: formatDays(days) }, { headers: { "cache-control": "no-store" } });
  }),
);
