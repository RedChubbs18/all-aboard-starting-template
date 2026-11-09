import { withRole } from "@/lib/auth/server";
import { adminResponse, createTemplate, listTemplates } from "@/server/admin-service";

/** P&P may read templates (read-only); only ADMIN may write. */
export const GET = withRole(["ADMIN", "PNP"], () => adminResponse(listTemplates));
export const POST = withRole(["ADMIN"], async (req, _ctx, user) => {
  const body = await req.json().catch(() => null);
  return adminResponse(() => createTemplate(user.id, body), 201);
});
