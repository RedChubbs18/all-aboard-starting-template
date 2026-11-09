import { withRole } from "@/lib/auth/server";
import { adminResponse, createContent, listContent } from "@/server/admin-service";

export const GET = withRole(["ADMIN"], () => adminResponse(listContent));
export const POST = withRole(["ADMIN"], async (req, _ctx, user) => {
  const body = await req.json().catch(() => null);
  return adminResponse(() => createContent(user.id, body), 201);
});
