import { authMode } from "@/lib/auth/server";
import { demoGate } from "@/lib/auth/demo-gate";
import { prisma } from "@/server/db";
import { parseRoles } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/** Demo persona list. 404 unless AUTH_MODE=demo; 403 off this computer unless DEMO_PIN is set. */
export async function GET(req: Request) {
  if (authMode() !== "demo") return new Response("Not found", { status: 404 });
  const denied = demoGate(req);
  if (denied) return denied;
  const users = await prisma.user.findMany({ include: { team: true }, orderBy: { displayName: "asc" } });
  return Response.json({
    personas: users.map((u) => ({ id: u.id, displayName: u.displayName, roles: parseRoles(u.roles), teamName: u.team?.name ?? null })),
  });
}
