import { authMode } from "@/lib/auth/server";
import { prisma } from "@/server/db";
import { parseRoles } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/** Demo persona list. 404 unless AUTH_MODE=demo. */
export async function GET() {
  if (authMode() !== "demo") return new Response("Not found", { status: 404 });
  const users = await prisma.user.findMany({ include: { team: true }, orderBy: { displayName: "asc" } });
  return Response.json({
    personas: users.map((u) => ({ id: u.id, displayName: u.displayName, roles: parseRoles(u.roles), teamName: u.team?.name ?? null })),
  });
}
