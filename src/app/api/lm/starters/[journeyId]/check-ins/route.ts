import { buildDetail } from "../../../_lib/detail";
import { lmRoute, parseBody, requireManagedJourney, type JourneyParams } from "../../../_lib/guard";
import { checkInSchema } from "@/components/lm/schemas";
import { meetingLink } from "@/lib/teams";
import { prisma } from "@/server/db";
import { upsertCheckIn } from "@/server/journey-service";

const CADENCE_LABEL = { WEEKLY: "weekly", FORTNIGHTLY: "fortnightly", MONTHLY: "monthly" } as const;

/** FR-LM.3 / FR-4.7: agree a check-in cadence and generate a Teams meeting link (deep link, no Graph writes). */
export const POST = lmRoute<JourneyParams>(async (req, ctx, user) => {
  const { journeyId } = await ctx.params;
  const j = await requireManagedJourney(journeyId, user);
  const v = await parseBody(req, checkInSchema);
  const [starter, lm] = await Promise.all([
    prisma.user.findUnique({ where: { id: j.starterId } }),
    prisma.user.findUnique({ where: { id: j.lmId } }),
  ]);
  const start = new Date(v.scheduledAt);
  const link = meetingLink({
    subject: `Onboarding check-in: ${starter?.displayName ?? "new starter"}`,
    attendees: [starter?.upn, lm?.upn].filter((u): u is string => !!u),
    startTime: start,
    endTime: new Date(start.getTime() + 30 * 60_000),
    content: `${CADENCE_LABEL[v.cadence]} check-in during onboarding.`,
  });
  await upsertCheckIn(journeyId, { cadence: v.cadence, scheduledAt: start, meetingLink: link }, user.id);
  return Response.json(await buildDetail(journeyId, user));
});
