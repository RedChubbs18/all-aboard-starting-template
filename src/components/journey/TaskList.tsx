import type { Owner } from "@/domain/types";
import { TaskCard } from "./TaskCard";
import type { TaskDto } from "./types";
import { visibleTasks } from "./derive";

interface Props {
  tasks: TaskDto[];
  readOnly?: boolean;
  highlightOwner?: Owner;
  viewerIsStarter?: boolean;
  label: string;
  emptyText?: string;
  now?: Date;
  onComplete?: (task: TaskDto) => void;
  pendingId?: string | null;
}

/** Tasks with `applicable === false` are never shown (FR-4.5). */
export function TaskList({ tasks, readOnly, highlightOwner, viewerIsStarter, label, emptyText = "No tasks in this stage yet.", now, onComplete, pendingId }: Props) {
  const list = visibleTasks(tasks);
  if (list.length === 0) return <p className="px-3 py-4 text-muted">{emptyText}</p>;
  return (
    <ul aria-label={label} className="overflow-hidden">
      {list.map((t) => (
        <TaskCard
          key={t.id}
          task={t}
          readOnly={readOnly}
          highlightOwner={highlightOwner}
          viewerIsStarter={viewerIsStarter}
          now={now}
          onComplete={onComplete}
          pending={pendingId === t.id}
        />
      ))}
    </ul>
  );
}
