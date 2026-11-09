import { withRole } from "@/lib/auth/server";
import { adminResponse, changeAdapterMode } from "@/server/admin-service";

/** Body: { mode: "MOCK" | "REAL" }. An ADAPTER_<KEY>_MODE env override still wins at runtime. */
export const PUT = withRole<{ params: Promise<{ key: string }> }>(["ADMIN"], async (req, ctx, user) => {
  const { key } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { mode?: unknown } | null;
  return adminResponse(() => changeAdapterMode(user.id, key, body?.mode));
});
