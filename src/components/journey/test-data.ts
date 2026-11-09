import type { Stage, TaskStatus } from "@/domain/types";
import type { TaskDto } from "./types";

let n = 0;
/** Test helper: a task with sensible defaults. */
export function task(over: Partial<TaskDto> & { key: string; stage: Stage }): TaskDto {
  n++;
  return {
    id: `t${n}`,
    title: over.key,
    description: "",
    owner: "STARTER",
    type: "ACTION",
    status: "TODO" as TaskStatus,
    dueDate: "2026-12-01T00:00:00.000Z",
    completedAt: null,
    blockedReason: null,
    dependsOn: [],
    gating: true,
    contentSlug: null,
    adapterKey: null,
    source: "CORE",
    canAct: true,
    lockedReason: null,
    ...over,
  };
}
