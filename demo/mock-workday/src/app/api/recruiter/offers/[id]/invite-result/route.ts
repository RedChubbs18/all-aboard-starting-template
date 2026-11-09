import { recruiterRoute } from "@/lib/guard";
import { notifyMyJourney, recruiterView } from "@/lib/pipeline";
import { getOfferById, recordInvite, type InviteStatus } from "@/lib/store";

export const dynamic = "force-dynamic";

const STATUSES: InviteStatus[] = ["invited", "simulated", "failed"];

/** Receives guest object id + status only from the recruiter's browser, then calls the MyJourney webhook. */
export const POST = recruiterRoute(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => null)) as { guestObjectId?: unknown; inviteStatus?: unknown; error?: unknown } | null;
  const inviteStatus = STATUSES.find((s) => s === b?.inviteStatus);
  if (!inviteStatus) return Response.json({ error: "validation", message: "inviteStatus must be invited, simulated or failed." }, { status: 400 });
  const guestObjectId = typeof b?.guestObjectId === "string" && b.guestObjectId.length <= 64 ? b.guestObjectId : null;
  const offer = await getOfferById(id);
  if (!offer) return Response.json({ error: "not_found" }, { status: 404 });
  if (offer.status !== "accepted_pending_invite") return Response.json({ error: "conflict", message: "Offer is not waiting for an invite." }, { status: 409 });
  await recordInvite(id, { guestObjectId, inviteStatus, error: typeof b?.error === "string" ? b.error.slice(0, 200) : undefined });
  const updated = inviteStatus === "failed" ? await getOfferById(id) : await notifyMyJourney(id);
  return Response.json({ offer: updated ? recruiterView(updated) : null });
});
