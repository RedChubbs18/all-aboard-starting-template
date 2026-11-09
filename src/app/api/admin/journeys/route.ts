import { withRole } from "@/lib/auth/server";
import { adminResponse, listAdminJourneys } from "@/server/admin-service";

/** P&P and Admin may list journeys for exit recording. */
export const GET = withRole(["ADMIN", "PNP"], () => adminResponse(listAdminJourneys));
