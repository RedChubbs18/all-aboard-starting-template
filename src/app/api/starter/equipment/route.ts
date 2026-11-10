import { entitledModels } from "@/adapters/equipment/catalogue";
import { getAdapter } from "@/adapters/registry";
import { withRole } from "@/lib/auth/server";
import { HOME_ITEMS, HOME_PREFIX, PERIPHERAL_OPTIONS } from "@/components/journey/detail-types";
import { prisma } from "@/server/db";
import { completeTask, recordEvent } from "@/server/journey-service";
import { assertCanAct, taskContext } from "../_lib/context";
import { guard, HttpError, readJson } from "../_lib/http";

const PERIPHERALS_TASK_KEY = "choose-peripherals";

const inList = (xs: unknown, allowed: readonly string[]): string[] | null =>
  Array.isArray(xs) && xs.every((x) => typeof x === "string" && allowed.includes(x)) ? (xs as string[]) : null;

/**
 * FR-3.7 device choice, FR-4.1 home working order. Submitted through EquipmentAdapter, then the task completes.
 * Home items are stored alongside the device choice with a prefix so FR-4.8 can still show the collect list.
 * D29: the primary device is one of the two models for the starter's job family (`modelId`).
 */
export const POST = withRole(["STARTER", "LM", "PNP", "ADMIN"], (req, _ctx, user) =>
  guard(async () => {
    const body = await readJson<{ taskId?: string; modelId?: string; peripherals?: unknown }>(req);
    if (typeof body.taskId !== "string") throw new HttpError(400, "bad_request", "taskId is required");
    const { journey, task } = await taskContext(user, body.taskId);
    assertCanAct(user, journey, task);
    if (task.adapterKey !== "equipment" || task.type !== "ORDER") throw new HttpError(409, "wrong_task", "This task is not an equipment order");
    if (task.status === "LOCKED") throw new HttpError(409, "locked", "This task is locked");

    const eq = await getAdapter("equipment");
    const existing = await eq.getChoice(journey.id);
    const home = task.key === "order-home-working-items";
    const peripheralsTask = task.key === PERIPHERALS_TASK_KEY;

    const starter = await prisma.user.findUnique({ where: { id: journey.starterId }, select: { jobFamily: true } });
    const entitled = entitledModels(starter?.jobFamily);
    const pickModel = () => {
      const m = entitled.find((x) => x.id === body.modelId);
      if (!m) throw new HttpError(422, "invalid", `Choose one of: ${entitled.map((x) => x.label).join(" or ")}`);
      return m;
    };

    let device: "MAC" | "WINDOWS";
    let modelId: string | undefined;
    let peripherals: string[];
    if (home) {
      const items = inList(body.peripherals, HOME_ITEMS);
      if (!items || items.length === 0) throw new HttpError(422, "invalid", "Choose at least one home working item");
      const m = existing ? null : pickModel();
      device = existing?.device ?? m!.device;
      modelId = existing?.modelId ?? m?.id;
      peripherals = [...(existing?.peripherals ?? []).filter((p) => !p.startsWith(HOME_PREFIX)), ...items.map((i) => HOME_PREFIX + i)];
    } else if (peripheralsTask) {
      // F12: optional peripherals. Needs the primary device first; an empty list ("none needed") is fine.
      if (!existing) throw new HttpError(409, "needs_device", "Choose your primary device first");
      const items = inList(body.peripherals ?? [], PERIPHERAL_OPTIONS);
      if (!items) throw new HttpError(422, "invalid", "Unknown peripheral");
      device = existing.device;
      modelId = existing.modelId;
      peripherals = [...items, ...existing.peripherals.filter((p) => p.startsWith(HOME_PREFIX))];
    } else {
      // F12: the primary device task submits only the model and keeps any peripherals already chosen.
      const m = pickModel();
      device = m.device;
      modelId = m.id;
      peripherals = existing?.peripherals ?? [];
    }
    const choice = await eq.submitChoice(journey.id, { device, modelId, peripherals });
    if (task.status !== "DONE") await completeTask(journey.id, task.key, { actorId: user.id, evidence: choice.ref });
    // Changing the order on an already-done task: no task transition, so audit the adapter write (L3).
    else await recordEvent({ journeyId: journey.id, actorId: user.id, type: "EQUIPMENT_CHANGED", entity: "Task", entityId: task.id, data: { key: task.key, ref: choice.ref, device, model: choice.model, peripherals } });
    return Response.json({ ok: true, choice });
  }),
);
