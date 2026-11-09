import { withRole } from "@/lib/auth/server";

export const GET = withRole([], (_req, _ctx, user) => Response.json({ user }));
