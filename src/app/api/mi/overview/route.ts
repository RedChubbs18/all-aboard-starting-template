import { withRole } from "@/lib/auth/server";
import { getOverview, parseFilters } from "@/server/mi-service";

/** Everything the MI page shows, for one filter set. Query: stage, status, from, to, area, team. */
export const GET = withRole(["PNP", "ADMIN"], async (req) => {
  const f = parseFilters(new URL(req.url).searchParams);
  return Response.json(await getOverview(f), { headers: { "Cache-Control": "no-store" } });
});
