import { withRole } from "@/lib/auth/server";
import { adminResponse, createFaq, listFaqs } from "@/server/admin-service";

export const GET = withRole(["ADMIN"], () => adminResponse(listFaqs));
export const POST = withRole(["ADMIN"], async (req, _ctx, user) => {
  const body = await req.json().catch(() => null);
  return adminResponse(() => createFaq(user.id, body), 201);
});
