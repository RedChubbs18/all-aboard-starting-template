import { recruiterRoute } from "@/lib/guard";
import { purgeData } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Rehearsal reset (recruiter only): purges .data/. MyJourney's journey is removed with its own `npm run db:seed`. */
export const POST = recruiterRoute(async () => {
  await purgeData();
  return Response.json({ ok: true });
});
