import { withRole } from "@/lib/auth/server";
import { adminResponse, listTeams } from "@/server/admin-service";

export const GET = withRole(["ADMIN"], () => adminResponse(listTeams));
