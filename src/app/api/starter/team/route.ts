import { withRole } from "@/lib/auth/server";
import { parseRoles } from "@/lib/auth/roles";
import { prisma } from "@/server/db";
import { resolveJourney } from "../_lib/context";
import { guard } from "../_lib/http";

export interface TeamMemberDto {
  id: string;
  name: string;
  upn: string;
  teamRole: string | null;
  jobTitle: string | null;
  bio: string | null;
  photoUrl: string | null;
  reportsToId: string | null;
  reportsToName: string | null;
  isLm: boolean;
  isBuddy: boolean;
}

/**
 * FR-1.8 team page data: members of the team on the viewer's journey (or their own team), with reporting line.
 * Starters are not "the team", so they are excluded. LM and buddy are flagged so the page can pin them.
 */
export const GET = withRole(["STARTER", "BUDDY", "LM", "PNP", "ADMIN"], (req, _ctx, user) =>
  guard(async () => {
    let journey = null;
    try {
      journey = await resolveJourney(user, new URL(req.url).searchParams.get("journeyId"));
    } catch {
      journey = null;
    }
    const teamId = journey?.teamId ?? user.teamId;
    if (!teamId) return Response.json({ team: null, members: [] });
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    const all = await prisma.user.findMany({ where: { teamId }, orderBy: { displayName: "asc" } });
    const byId = new Map(all.map((u) => [u.id, u]));
    const members: TeamMemberDto[] = all
      .filter((u) => {
        const r = parseRoles(u.roles);
        return !(r.length === 1 && r[0] === "STARTER");
      })
      .map((u) => ({
        id: u.id,
        name: u.displayName,
        upn: u.upn,
        teamRole: u.teamRole,
        jobTitle: u.jobTitle,
        bio: u.bio,
        photoUrl: u.photoUrl,
        reportsToId: u.reportsToId,
        reportsToName: u.reportsToId ? (byId.get(u.reportsToId)?.displayName ?? null) : null,
        isLm: journey ? u.id === journey.lmId : parseRoles(u.roles).includes("LM"),
        isBuddy: journey ? u.id === journey.buddyId : false,
      }));
    return Response.json(
      { team: team ? { id: team.id, name: team.name, area: team.area } : null, starter: journey ? { id: journey.starterId } : null, members },
      { headers: { "cache-control": "no-store" } },
    );
  }),
);
