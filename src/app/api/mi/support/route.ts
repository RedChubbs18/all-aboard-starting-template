import { z } from "zod";
import { withRole } from "@/lib/auth/server";
import { MiError, raiseSupport } from "@/server/mi-service";

const Body = z.object({
  journeyId: z.string().min(1).max(200),
  taskKey: z.string().min(1).max(200).nullish(),
  note: z.string().max(500).nullish(),
});

/** FR-MI.2: raise support. The owner is derived on the server from the task, never from the client. */
export const POST = withRole(["PNP", "ADMIN"], async (req, _ctx, user) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request", message: "journeyId is required; note max 500 characters" }, { status: 400 });
  try {
    return Response.json(await raiseSupport(parsed.data, user.id));
  } catch (e) {
    if (e instanceof MiError) return Response.json({ error: e.code, message: e.message, ...e.extra }, { status: e.status });
    throw e;
  }
});
