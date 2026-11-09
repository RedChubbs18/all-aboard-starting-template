import { withRole } from "@/lib/auth/server";
import { getJourneyRows, parseFilters } from "@/server/mi-service";

/** Filtered starter rows for the MI table (P&P and admin only). */
export const GET = withRole(["PNP", "ADMIN"], async (req) => {
  const f = parseFilters(new URL(req.url).searchParams);
  return Response.json({ filters: f, journeys: await getJourneyRows(f) });
});
