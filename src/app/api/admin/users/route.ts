import { withRole } from "@/lib/auth/server";
import { adminResponse, listUsers } from "@/server/admin-service";

export const GET = withRole(["ADMIN"], () => adminResponse(listUsers));
