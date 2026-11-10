import { recruiterRoute } from "@/lib/guard";
import { webhookSecret } from "@/lib/hmac";
import { externalInvitesApproved, graphCredentials } from "@/lib/graphAuth";
import { myJourneyPublicUrl, recruiterView } from "@/lib/pipeline";
import { createOffer, listOffers } from "@/lib/store";
import { validateOfferInput } from "@/lib/validation";
import { fetchDirectory } from "@/lib/webhook";

export const dynamic = "force-dynamic";

export const GET = recruiterRoute(async () =>
  Response.json(
    {
      offers: (await listOffers()).map(recruiterView),
      meta: {
        invites: externalInvitesApproved() && graphCredentials() ? "real" : externalInvitesApproved() ? "simulated_no_credentials" : "simulated",
        myJourneyPublicUrl: myJourneyPublicUrl(),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  ),
);

export const POST = recruiterRoute(async (req) => {
  const v = validateOfferInput(await req.json().catch(() => null));
  if (!v.ok) return Response.json({ error: "validation", message: v.error }, { status: 400 });
  const secret = webhookSecret();
  if (!secret) return Response.json({ error: "not_configured", message: "WORKDAY_WEBHOOK_SECRET is not set." }, { status: 503 });
  let dir;
  try {
    dir = await fetchDirectory({ fetch, baseUrl: process.env.MYJOURNEY_INTERNAL_URL || "http://localhost:3000", secret });
  } catch {
    return Response.json({ error: "directory_unavailable", message: "Could not load teams from MyJourney." }, { status: 502 });
  }
  const team = dir.teams.find((t) => t.key === v.value.teamKey);
  const lm = team?.lineManagers.find((m) => m.key === v.value.lineManagerKey);
  if (!team || !lm) return Response.json({ error: "validation", message: "Unknown team or line manager." }, { status: 400 });
  const offer = await createOffer({ ...v.value, teamName: team.name, lineManagerName: lm.name });
  return Response.json({ offer: recruiterView(offer) }, { status: 201 });
});
