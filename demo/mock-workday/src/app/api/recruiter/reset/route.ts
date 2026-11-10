import { recruiterRoute } from "@/lib/guard";
import { clearRedeemUrls } from "@/lib/pipeline";
import { purgeData } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Rehearsal reset (local recruiter console only): purges .data/. MyJourney's journey is removed with its own `npm run db:seed`. */
export const POST = recruiterRoute(async () => {
  await purgeData();
  clearRedeemUrls();
  return Response.json({ ok: true });
});
