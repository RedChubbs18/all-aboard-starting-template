import { recruiterRoute } from "@/lib/guard";
import { notifyWithEvents, recruiterView, runAcceptPipeline } from "@/lib/pipeline";
import { addEvent, getOfferById, resetForRetry } from "@/lib/store";

export const dynamic = "force-dynamic";

export const POST = recruiterRoute(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const offer = await getOfferById(id);
  if (!offer) return Response.json({ error: "not_found" }, { status: 404 });
  if (offer.status !== "failed") return Response.json({ error: "conflict", message: "Only failed offers can be retried." }, { status: 409 });
  const reset = await resetForRetry(id);
  await addEvent(id, "Retrying.");
  // Invite already recorded: only the webhook is repeated. Otherwise the invite step runs again (one claim only).
  if (reset?.status === "invite_sent" || reset?.status === "invite_simulated") void notifyWithEvents(id);
  else void runAcceptPipeline(id);
  const out = await getOfferById(id);
  return Response.json({ offer: out ? recruiterView(out) : null });
});
