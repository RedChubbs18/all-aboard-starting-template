import { getWorkdayDirectory } from "@/server/workday-service";
import { workdayGuard } from "../_lib/guard";

export const dynamic = "force-dynamic";

/** Teams, business areas and line managers (keys and names only) for the mock Workday recruiter form. Signed over "<ts>.". */
export const GET = (req: Request) => workdayGuard(req, false, async () => Response.json(await getWorkdayDirectory()));
