import { recruiterRoute } from "@/lib/guard";
import { webhookSecret } from "@/lib/hmac";
import { fetchDirectory } from "@/lib/webhook";

export const dynamic = "force-dynamic";

export const GET = recruiterRoute(async () => {
  const secret = webhookSecret();
  if (!secret) return Response.json({ error: "not_configured", message: "WORKDAY_WEBHOOK_SECRET is not set (32+ characters)." }, { status: 503 });
  try {
    const dir = await fetchDirectory({ fetch, baseUrl: process.env.MYJOURNEY_INTERNAL_URL || "http://localhost:3000", secret });
    return Response.json(dir);
  } catch {
    return Response.json({ error: "directory_unavailable", message: "Could not load teams from MyJourney. Is it running with the same secret?" }, { status: 502 });
  }
});
