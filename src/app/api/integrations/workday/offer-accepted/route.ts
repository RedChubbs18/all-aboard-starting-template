import { handleOfferAccepted } from "@/server/workday-service";
import { workdayGuard } from "../_lib/guard";

/** Mock Workday webhook (D24): offer accepted -> starter + journey. HMAC-signed, idempotent on offerId. */
export const POST = (req: Request) => workdayGuard(req, true, async (raw) => Response.json(await handleOfferAccepted(raw)));
