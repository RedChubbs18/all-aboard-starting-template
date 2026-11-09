import { buildDetail } from "../../../../_lib/detail";
import { HttpError, lmRoute, parseBody, requireManagedJourney } from "../../../../_lib/guard";
import { LINK_TASK_KEYS, taskPatchSchema } from "@/components/lm/schemas";
import { canActOnTask } from "@/lib/auth/access";
import { loadJourney, mutateJourney, setTaskStatus } from "@/server/journey-service";

/**
 * Mark an LM-owned task done (or reopen it), and/or save the Teams links on the recurring
 * team calls tasks (FR-3.13; stored in `evidence` as references only, one URL per line).
 */
export const PATCH = lmRoute<{ params: Promise<{ journeyId: string; key: string }> }>(async (req, ctx, user) => {
  const { journeyId, key } = await ctx.params;
  const ref = await requireManagedJourney(journeyId, user);
  const v = await parseBody(req, taskPatchSchema);
  const journey = await loadJourney(journeyId);
  const task = journey?.tasks.find((t) => t.key === key && t.applicable);
  if (!journey || !task) throw new HttpError(404, "not_found", "Task not found");
  if (task.owner !== "LM" || !canActOnTask(user, ref, task.owner)) {
    throw new HttpError(403, "forbidden", "Only line manager tasks can be changed here");
  }
  if (v.links && !LINK_TASK_KEYS.includes(key)) {
    throw new HttpError(400, "invalid", "This task does not take links", { links: "This task does not take links" });
  }
  if (task.status === "LOCKED") throw new HttpError(409, "conflict", "This task is waiting on another task");

  const evidence = v.links ? v.links.join("\n") || null : undefined;
  if (v.status && v.status !== task.status) {
    await setTaskStatus(journeyId, key, v.status, { actorId: user.id, evidence });
  } else if (evidence !== undefined) {
    await mutateJourney(journeyId, (j) => ({
      journey: { ...j, tasks: j.tasks.map((t) => (t.key === key ? { ...t, evidence } : t)) },
      events: [
        {
          journeyId,
          actorId: user.id,
          type: "TASK_EVIDENCE_UPDATED",
          entity: "Task",
          entityId: task.id,
          from: null,
          to: null,
          data: { key, links: v.links?.length ?? 0 },
          createdAt: new Date(),
        },
      ],
    }));
  }
  return Response.json(await buildDetail(journeyId, user));
});
