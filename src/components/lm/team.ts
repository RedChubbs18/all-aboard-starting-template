import { LINK_TASK_KEYS } from "./schemas";
import type { TaskDto } from "./types";

/**
 * F11: the team checklist is shown only when the starter has TEAM-source tasks (seeded template or LM-added).
 * The recurring-calls tasks join it when it is shown; otherwise they stay in "Your tasks".
 */
export function teamChecklistItems(tasks: Pick<TaskDto, "source" | "key" | "dueDate">[]): typeof tasks {
  if (!tasks.some((t) => t.source === "TEAM")) return [];
  return tasks.filter((t) => t.source === "TEAM" || LINK_TASK_KEYS.includes(t.key)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
