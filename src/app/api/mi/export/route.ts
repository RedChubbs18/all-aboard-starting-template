import { withRole } from "@/lib/auth/server";
import { EXPORT_TYPES, exitsCsv, funnelCsv, issuesCsv, journeysCsv, type ExportType } from "@/server/mi-csv";
import { getExitReport, getFunnel, getIssues, getJourneyRows, parseFilters } from "@/server/mi-service";

/** CSV export honouring the dashboard filters: ?type=journeys|issues|exits|funnel&stage=... */
export const GET = withRole(["PNP", "ADMIN"], async (req) => {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as ExportType | null;
  if (!type || !EXPORT_TYPES.includes(type)) {
    return Response.json({ error: "bad_request", message: `type must be one of ${EXPORT_TYPES.join(", ")}` }, { status: 400 });
  }
  const f = parseFilters(url.searchParams);
  const body =
    type === "journeys" ? journeysCsv(await getJourneyRows(f))
    : type === "issues" ? issuesCsv(await getIssues(f))
    : type === "exits" ? exitsCsv((await getExitReport(f)).rows, { includeComments: url.searchParams.get("includeComments") === "1" })
    : funnelCsv(await getFunnel(f));
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mi-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
