import { withRole } from "@/lib/auth/server";
import { adminResponse, getDirectory } from "@/server/admin-service";

/** Pickers for teams, LMs, buddies and starters without a journey (admin only). */
export const GET = withRole(["ADMIN"], () => adminResponse(getDirectory));
