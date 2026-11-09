import { z } from "zod";
import { withRole } from "@/lib/auth/server";
import { MiError, chaseLm } from "@/server/mi-service";

const Body = z.object({ lmId: z.string().min(1).max(200) });

/** FR-MI.3: nudge a line manager about overdue tasks. 409 within 24h of the last chase. */
export const POST = withRole(["PNP", "ADMIN"], async (req, _ctx, user) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request", message: "lmId is required" }, { status: 400 });
  try {
    return Response.json(await chaseLm(parsed.data.lmId, user.id));
  } catch (e) {
    if (e instanceof MiError) return Response.json({ error: e.code, message: e.message, ...e.extra }, { status: e.status });
    throw e;
  }
});
