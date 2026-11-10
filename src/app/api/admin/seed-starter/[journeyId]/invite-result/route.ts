import { z } from "zod";
import { withRole } from "@/lib/auth/server";
import { prisma } from "@/server/db";
import { recordEvent } from "@/server/journey-service";
import { completeGuestInviteTask } from "@/server/integration-service";
import { prismaStore } from "@/adapters/store";
import { createIdentityMock } from "@/adapters/identity/mock";
import { createIdentityReal } from "@/adapters/identity/real";
import { FALLBACK_REASONS } from "@/lib/graph/invite";

/**
 * D19: the admin's browser reports the outcome of a Graph invite. Only the guest object id and a status are
 * accepted (`.strict()` rejects any other key, so an email address cannot be smuggled in) and only the
 * object id and status are stored. One report per journey: it is accepted only while identity is still "none".
 */
const bodySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("invited"), guestObjectId: z.guid() }).strict(),
  z.object({ status: z.literal("fallback"), reason: z.enum(FALLBACK_REASONS) }).strict(),
]);

export const POST = withRole(["ADMIN"], async (req, ctx: { params: Promise<{ journeyId: string }> }, user) => {
  const { journeyId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation", message: "Report only a status and guest object id" }, { status: 400 });
  const body = parsed.data;

  const journey = await prisma.journey.findUnique({ where: { id: journeyId } });
  if (!journey) return Response.json({ error: "not_found", message: "Journey not found" }, { status: 404 });
  const current = await createIdentityReal(prismaStore).getStatus(journeyId);
  if (current.status !== "none") return Response.json({ error: "conflict", message: "An invite result is already recorded for this journey" }, { status: 409 });

  if (body.status === "invited") {
    // The guest signs in with this object id, so it must map to the starter (entraOid is unique).
    const starter = await prisma.user.findUnique({ where: { id: journey.starterId } });
    const owner = await prisma.user.findUnique({ where: { entraOid: body.guestObjectId } });
    if (owner && owner.id !== journey.starterId) {
      return Response.json(
        { error: "conflict", message: "That guest account is already linked to another user, so it cannot sign in as this starter. The invite was not recorded; run npm run db:seed or invite a different email." },
        { status: 409 },
      );
    }
    // Never overwrite an existing, different mapping: that would lock a real person out.
    const link = !!starter && (starter.entraOid === null || starter.entraOid === body.guestObjectId);
    const r = await createIdentityReal(prismaStore).recordGuestInvite(journeyId, body.guestObjectId);
    if (link && starter!.entraOid === null) await prisma.user.update({ where: { id: starter!.id }, data: { entraOid: body.guestObjectId } });
    await recordEvent({ journeyId, actorId: user.id, type: "INTEGRATION_STATUS", entity: "Integration", entityId: "identity", data: { status: r.status, via: "graph", guestObjectId: body.guestObjectId, oidLinked: link } });
    await completeGuestInviteTask(journeyId, { actorId: user.id }, "graph"); // the invite went out
    return Response.json({ status: r.status, via: "graph", oidLinked: link });
  }

  // Fallback: the demo invite. The mock never stores the address; the work placeholder satisfies its format check.
  const starter = await prisma.user.findUnique({ where: { id: journey.starterId } });
  const r = await createIdentityMock(prismaStore).inviteGuest(journeyId, starter?.upn ?? "starter@example.test");
  await recordEvent({ journeyId, actorId: user.id, type: "INTEGRATION_STATUS", entity: "Integration", entityId: "identity", data: { status: r.status, via: "mock_fallback", reason: body.reason } });
  await completeGuestInviteTask(journeyId, { actorId: user.id }, "mock"); // the demo invite was sent
  return Response.json({ status: r.status, via: "mock_fallback" });
});
