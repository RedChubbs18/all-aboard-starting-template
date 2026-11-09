import { withRole } from "@/lib/auth/server";
import { journeyScopeWhere } from "@/lib/auth/access";
import { prisma } from "@/server/db";
import { parseRoles } from "@/lib/auth/roles";

/** Team members for the caller: their own team, or the team of their journey. */
export const GET = withRole(["STARTER", "BUDDY", "LM", "PNP", "ADMIN"], async (_req, _ctx, user) => {
  let teamId = user.teamId;
  if (!teamId) {
    const j = await prisma.journey.findFirst({ where: journeyScopeWhere(user) });
    teamId = j?.teamId ?? null;
  }
  if (!teamId) return Response.json({ team: null, members: [] });
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  const all = await prisma.user.findMany({ where: { teamId }, orderBy: { displayName: "asc" } });
  const members = all.filter((m) => !(parseRoles(m.roles).length === 1 && parseRoles(m.roles)[0] === "STARTER")); // starters are not "the team"
  return Response.json({
    team,
    members: members.map((m) => ({ id: m.id, displayName: m.displayName, teamRole: m.teamRole, jobTitle: m.jobTitle, bio: m.bio, photoUrl: m.photoUrl, upn: m.upn, roles: parseRoles(m.roles) })),
  });
});
