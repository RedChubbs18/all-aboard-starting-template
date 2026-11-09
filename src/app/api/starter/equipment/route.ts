import { getAdapter } from "@/adapters/registry";
import { withRole } from "@/lib/auth/server";
import { HOME_ITEMS, HOME_PREFIX, PERIPHERAL_OPTIONS } from "@/components/journey/detail-types";
import { completeTask, recordEvent } from "@/server/journey-service";
import { assertCanAct, taskContext } from "../_lib/context";
import { guard, HttpError, readJson } from "../_lib/http";

const PERIPHERALS_TASK_KEY = "choose-peripherals";

const inList = (xs: unknown, allowed: readonly string[]): string[] | null =>
  Array.isArray(xs) && xs.every((x) => typeof x === "string" && allowed.includes(x)) ? (xs as string[]) : null;

/**
 * FR-3.7 device choice, FR-4.1 home working order. Submitted through EquipmentAdapter, then the task completes.
 * Home items are stored alongside the device choice with a prefix so FR-4.8 can still show the collect list.
 */
export const POST = withRole(["STARTER", "LM", "PNP", "ADMIN"], (req, _ctx, user) =>
  guard(async () => {
    const body = await readJson<{ taskId?: string; device?: string; peripherals?: unknown }>(req);
    if (typeof body.taskId !== "string") throw new HttpError(400, "bad_request", "taskId is required");
    const { journey, task } = await taskContext(user, body.taskId);
    assertCanAct(user, journey, task);
    if (task.adapterKey !== "equipment" || task.type !== "ORDER") throw new HttpError(409, "wrong_task", "This task is not an equipment order");
    if (task.status === "LOCKED") throw new HttpError(409, "locked", "This task is locked");

    const eq = await getAdapter("equipment");
    const existing = await eq.getChoice(journey.id);
    const home = task.key === "order-home-working-items";
    const peripheralsTask = task.key === PERIPHERALS_TASK_KEY;

    let device: "MAC" | "WINDOWS";
    let peripherals: string[];
    if (home) {
      const items = inList(body.peripherals, HOME_ITEMS);
      if (!items || items.length === 0) throw new HttpError(422, "invalid", "Choose at least one home working item");
      const d = existing?.device ?? body.device;
      if (d !== "MAC" && d !== "WINDOWS") throw new HttpError(422, "invalid", "Choose Mac or Windows");
      device = d;
      peripherals = [...(existing?.peripherals ?? []).filter((p) => !p.startsWith(HOME_PREFIX)), ...items.map((i) => HOME_PREFIX + i)];
    } else if (peripheralsTask) {
      // F12: optional peripherals. Needs the primary device first; an empty list ("none needed") is fine.
      if (!existing) throw new HttpError(409, "needs_device", "Choose your primary device first");
      const items = inList(body.peripherals ?? [], PERIPHERAL_OPTIONS);
      if (!items) throw new HttpError(422, "invalid", "Unknown peripheral");
      device = existing.device;
      peripherals = [...items, ...existing.peripherals.filter((p) => p.startsWith(HOME_PREFIX))];
    } else {
      // F12: the primary device task submits only the device and keeps any peripherals already chosen.
      if (body.device !== "MAC" && body.device !== "WINDOWS") throw new HttpError(422, "invalid", "Choose Mac or Windows");
      device = body.device;
      peripherals = existing?.peripherals ?? [];
    }
    const choice = await eq.submitChoice(journey.id, { device, peripherals });
    if (task.status !== "DONE") await completeTask(journey.id, task.key, { actorId: user.id, evidence: choice.ref });
    // Changing the order on an already-done task: no task transition, so audit the adapter write (L3).
    else await recordEvent({ journeyId: journey.id, actorId: user.id, type: "EQUIPMENT_CHANGED", entity: "Task", entityId: task.id, data: { key: task.key, ref: choice.ref, device, peripherals } });
    return Response.json({ ok: true, choice });
  }),
);
