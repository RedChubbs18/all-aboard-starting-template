import { withRole } from "@/lib/auth/server";
import { adminResponse, seedNewStarter } from "@/server/admin-service";

/** Demo step 1: create a starter and their journey, then send the (mock) guest invite. */
export const POST = withRole(["ADMIN"], async (req, _ctx, user) => {
  const body = await req.json().catch(() => null);
  return adminResponse(() => seedNewStarter(user.id, body), 201);
});
