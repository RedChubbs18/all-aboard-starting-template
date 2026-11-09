import { clientIp, rateLimit, tooMany } from "@/lib/guard";
import { candidateView, getOfferByToken } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Public. Returns only the offer that belongs to this token, never the candidate's email. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!rateLimit(`get:${clientIp(req)}`, 120, 60_000)) return tooMany();
  const { token } = await ctx.params;
  const offer = await getOfferByToken(token);
  if (!offer) return Response.json({ error: "not_found", message: "This offer link is not valid." }, { status: 404 });
  return Response.json({ offer: candidateView(offer) }, { headers: { "Cache-Control": "no-store" } });
}
