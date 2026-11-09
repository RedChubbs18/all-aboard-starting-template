import { z } from "zod";
import { withRole } from "@/lib/auth/server";
import { runReminders } from "@/server/integration-service";
import { guarded } from "../http";

const body = z.object({
  /** Ignore the suppression window (demo). */
  force: z.boolean().optional(),
  /** Suppression window in hours (default 24). */
  hours: z.number().positive().max(24 * 30).optional(),
});

/**
 * FR-2.2 scheduler tick. Call it from a cron or the admin button; there are no timers in request paths.
 * An empty body is fine.
 */
export const POST = withRole(["ADMIN", "PNP"], (req, _ctx, user) =>
  guarded(async () => {
    const raw = (await req.text()).trim();
    let json: unknown = {};
    if (raw) {
      try {
        json = JSON.parse(raw);
      } catch {
        return Response.json({ error: "invalid_json", message: "The request body is not valid JSON" }, { status: 400 });
      }
    }
    const parsed = body.safeParse(json);
    if (!parsed.success) return Response.json({ error: "invalid_body", message: "force must be boolean, hours a positive number" }, { status: 400 });
    const b = parsed.data;
    return Response.json(await runReminders(new Date(), { ...b, actorId: user.id }));
  }),
);
