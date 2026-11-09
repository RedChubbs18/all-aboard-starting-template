import { withRole } from "@/lib/auth/server";
import { getAdapter } from "@/adapters/registry";
import { recordEvent } from "@/server/journey-service";

/** Marks one of the caller's notifications read. Someone else's id returns 404. */
export const POST = withRole<{ params: Promise<{ id: string }> }>(
  ["STARTER", "BUDDY", "LM", "PNP", "ADMIN"],
  async (_req, ctx, user) => {
    const { id } = await ctx.params;
    const adapter = await getAdapter("notification");
    const mine = (await adapter.list({ toUserId: user.id })).find((n) => n.id === id);
    if (!mine || !(await adapter.markRead(id, user.id))) return Response.json({ error: "not_found" }, { status: 404 });
    if (!mine.read) {
      await recordEvent({ journeyId: mine.journeyId ?? null, actorId: user.id, type: "NOTIFICATION_READ", entity: "Notification", entityId: id });
    }
    return Response.json({ ok: true });
  },
);
