import { withRole } from "@/lib/auth/server";
import { adminResponse, recordExit } from "@/server/admin-service";

/** D14: P&P or Admin records an exit. Body: { reason, note? }. */
export const POST = withRole<{ params: Promise<{ id: string }> }>(["ADMIN", "PNP"], async (req, ctx, user) => {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  return adminResponse(() => recordExit(user.id, id, body));
});
