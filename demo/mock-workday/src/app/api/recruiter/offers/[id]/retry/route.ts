import { recruiterRoute } from "@/lib/guard";
import { notifyMyJourney, recruiterView } from "@/lib/pipeline";
import { getOfferById, resetForRetry } from "@/lib/store";

export const dynamic = "force-dynamic";

export const POST = recruiterRoute(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const offer = await getOfferById(id);
  if (!offer) return Response.json({ error: "not_found" }, { status: 404 });
  if (offer.status !== "failed") return Response.json({ error: "conflict", message: "Only failed offers can be retried." }, { status: 409 });
  const reset = await resetForRetry(id);
  // Invite already recorded: only the webhook needs repeating. Otherwise the console loop re-runs the invite.
  const out = reset && (reset.status === "invite_sent" || reset.status === "invite_simulated") ? await notifyMyJourney(id) : reset;
  return Response.json({ offer: out ? recruiterView(out) : null });
});
