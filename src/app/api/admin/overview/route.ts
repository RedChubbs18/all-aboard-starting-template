import { withRole } from "@/lib/auth/server";
import { adminResponse, getOverview } from "@/server/admin-service";

/** Admin home counts (admin only). */
export const GET = withRole(["ADMIN"], () => adminResponse(getOverview));
