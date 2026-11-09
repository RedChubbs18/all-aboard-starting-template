import { clientIp, csrfCheck, rateLimit, tooMany } from "@/lib/guard";
import { acceptOffer, candidateView } from "@/lib/store";
import { validateCandidate } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const csrf = csrfCheck(req);
  if (csrf) return csrf;
  if (!rateLimit(`accept:${clientIp(req)}`, 10, 60_000)) return tooMany();
  const { token } = await ctx.params;
  const v = validateCandidate(await req.json().catch(() => null));
  if (!v.ok) return Response.json({ error: "validation", errors: v.errors }, { status: 400 });
  const r = await acceptOffer(token, v.value);
  if (!r.ok) {
    const map = {
      not_found: [404, "This offer link is not valid."],
      used: [409, "This offer has already been accepted."],
      expired: [410, "This offer link has expired. Please contact your recruiter."],
    } as const;
    const [status, message] = map[r.reason];
    return Response.json({ error: r.reason, message }, { status });
  }
  return Response.json({ offer: candidateView(r.offer) }, { status: 201 });
}
