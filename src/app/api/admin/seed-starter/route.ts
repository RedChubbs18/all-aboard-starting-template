import { authMode, withRole } from "@/lib/auth/server";
import { adminResponse, seedNewStarter } from "@/server/admin-service";

/**
 * Demo step 1: create a starter and their journey, then send the (mock) guest invite.
 * With AUTH_MODE=entra and NEXT_PUBLIC_GRAPH_INVITES=on the browser may ask to defer the invite (`deferInvite`):
 * it then sends the Graph invite itself and reports back to /api/admin/seed-starter/[journeyId]/invite-result.
 * The flag is ignored in any other configuration, so the mock path cannot be skipped by a crafted body.
 */
export const POST = withRole(["ADMIN"], async (req, _ctx, user) => {
  const body = await req.json().catch(() => null);
  const deferInvite =
    body !== null && typeof body === "object" && (body as { deferInvite?: unknown }).deferInvite === true && authMode() === "entra" && process.env.NEXT_PUBLIC_GRAPH_INVITES === "on";
  return adminResponse(() => seedNewStarter(user.id, body, { deferInvite }), 201);
});
