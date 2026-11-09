import { authMode, withRole } from "@/lib/auth/server";
import { completeGuestSignIn } from "@/server/guest-sign-in";

export const GET = withRole([], async (_req, _ctx, user) => {
  // First successful Entra sign-in of a starter completes their "guest-sign-in" task. Never in demo mode.
  if (authMode() === "entra" && user.roles.includes("STARTER")) await completeGuestSignIn(user.id);
  return Response.json({ user });
});
