"use client";

import { useMemo } from "react";
import type { Task } from "@/lib/types/task";
import type { Project } from "@/lib/types/project";
import { TaskRowList } from "./TaskRowList";

export function TaskListView({
  tasks,
  selected,
  focusedId,
  projects,
  onOpen,
  onToggleSelect,
  onPatch,
  onDuplicate,
  onDelete,
}: {
  tasks: Task[];
  selected: Set<string>;
  focusedId: string | null;
  projects: Project[];
  onOpen: (t: Task) => void;
  onToggleSelect: (id: string, e?: React.MouseEvent) => void;
  onPatch: (id: string, patch: Partial<Task>) => void;
  onDuplicate: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const subStatsById = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>();
    for (const t of tasks) {
      if (!t.parent_task_id) continue;
      const prev = m.get(t.parent_task_id) ?? { done: 0, total: 0 };
      prev.total += 1;
      if (t.completed_at) prev.done += 1;
      m.set(t.parent_task_id, prev);
    }
    return m;
  }, [tasks]);

  // Show only top-level tasks (sub-tasks live in detail pane)
  const topLevel = useMemo(
    () => tasks.filter((t) => !t.parent_task_id),
    [tasks],
  );

  if (topLevel.length === 0) {
    return (
      <div className="rounded-md bg-ink-1 p-12 text-center">
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          No tasks yet. Press <kbd className="px-1.5 py-0.5 rounded-sm bg-ink-2 text-ink-4 font-[family-name:var(--font-mono)] text-[10px]">C</kbd> to create one.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {topLevel.map((t) => (
        <TaskRowList
          key={t.id}
          task={t}
          selected={selected.has(t.id)}
          anySelected={selected.size > 0}
          subStats={subStatsById.get(t.id) ?? null}
          projects={projects}
          onOpen={onOpen}
          onToggleSelect={onToggleSelect}
          onPatch={onPatch}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          isFocused={focusedId === t.id}
        />
      ))}
    </ul>
  );
}
