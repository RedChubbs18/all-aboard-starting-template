import { withRole } from "@/lib/auth/server";
import { adminResponse, deleteFaq, updateFaq } from "@/server/admin-service";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withRole<Ctx>(["ADMIN"], async (req, ctx, user) => {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  return adminResponse(() => updateFaq(user.id, id, body));
});
export const DELETE = withRole<Ctx>(["ADMIN"], async (_req, ctx, user) => {
  const { id } = await ctx.params;
  return adminResponse(() => deleteFaq(user.id, id));
});
