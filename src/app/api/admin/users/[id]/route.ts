import { withRole } from "@/lib/auth/server";
import { adminResponse, updateUser } from "@/server/admin-service";

export const PUT = withRole<{ params: Promise<{ id: string }> }>(["ADMIN"], async (req, ctx, user) => {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  return adminResponse(() => updateUser(user.id, id, body));
});
