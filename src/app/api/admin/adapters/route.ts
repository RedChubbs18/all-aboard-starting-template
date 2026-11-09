import { withRole } from "@/lib/auth/server";
import { adminResponse, listAdapters } from "@/server/admin-service";

export const GET = withRole(["ADMIN"], () => adminResponse(listAdapters));
