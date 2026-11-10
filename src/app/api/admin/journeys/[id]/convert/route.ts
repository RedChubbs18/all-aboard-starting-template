import { withRole } from "@/lib/auth/server";
import { prisma } from "@/server/db";
import { convertStarterToMember } from "@/server/identity-conversion";

/** D39: P&P or Admin retries (or manually triggers) the guest-to-member conversion. No body. Idempotent. */
export const POST = withRole<{ params: Promise<{ id: string }> }>(["ADMIN", "PNP"], async (_req, ctx, user) => {
  const { id } = await ctx.params;
  if (!(await prisma.journey.findUnique({ where: { id }, select: { id: true } }))) return Response.json({ error: "not_found", message: "Journey not found" }, { status: 404 });
  const r = await convertStarterToMember(id, { actorId: user.id, trigger: "manual" });
  const status = r.status === "refused" ? 409 : r.status === "in_progress" ? 202 : 200;
  return Response.json(r, { status });
});
