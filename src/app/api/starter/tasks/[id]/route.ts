import { withRole } from "@/lib/auth/server";
import type { TaskDetailResponse } from "@/components/journey/detail-types";
import { buildTaskDetail } from "../../_lib/detail";
import { pnpContact, relationOf, toPerson, toTaskDto } from "../../_lib/dto";
import { taskContext } from "../../_lib/context";
import { guard } from "../../_lib/http";
import { prisma } from "@/server/db";

/** Task detail with the type-specific data (adapters are read here, never from the browser). */
export const GET = withRole<{ params: Promise<{ id: string }> }>(["STARTER", "BUDDY", "LM", "PNP", "ADMIN"], (_req, ctx, user) =>
  guard(async () => {
    const { id } = await ctx.params;
    const { journey, task } = await taskContext(user, id);
    const ids = [journey.starterId, journey.lmId, ...(journey.buddyId ? [journey.buddyId] : [])];
    const people = await prisma.user.findMany({ where: { id: { in: ids } } });
    const person = (pid: string) => toPerson(people.find((p) => p.id === pid)!);
    const extra = await buildTaskDetail(journey, task);
    const body: TaskDetailResponse = {
      task: toTaskDto(journey, task, user),
      journey: {
        id: journey.id,
        status: journey.status,
        currentStage: journey.currentStage,
        startDate: journey.startDate.toISOString(),
        viewerIsStarter: journey.starterId === user.id,
        viewerRelation: relationOf(user, journey),
        starter: person(journey.starterId),
        lm: person(journey.lmId),
        buddy: journey.buddyId ? person(journey.buddyId) : null,
        pnp: await pnpContact(),
      },
      ...extra,
    };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  }),
);
