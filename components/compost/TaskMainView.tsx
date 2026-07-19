"use client";

import type { Task, TaskStatus, TaskUrgency } from "@/lib/types/task";
import type { Project } from "@/lib/types/project";
import type { CrmView } from "./ViewSwitcher";
import { TaskBoard } from "./TaskBoard";
import { TaskStatusBoard } from "./TaskStatusBoard";
import { TaskSmart } from "./TaskSmart";
import { TaskCategory } from "./TaskCategory";
import { TaskListView } from "./TaskListView";
import { TaskTableView } from "./TaskTableView";
import { TaskCalendarView } from "./TaskCalendarView";

export function TaskMainView({
  view,
  tasks,
  projects,
  selected,
  focusedId,
  onOpen,
  onToggleSelect,
  onPatch,
  onDuplicate,
  onDelete,
  onMoveStatus,
  onMoveUrgency,
  tasksById,
  onError,
  onCreateForDate,
  onBulkPatchDueDate,
}: {
  view: CrmView;
  tasks: Task[];
  projects: Project[];
  selected: Set<string>;
  focusedId: string | null;
  onOpen: (t: Task) => void;
  onToggleSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<Task>) => void;
  onDuplicate: (t: Task) => void;
  onDelete: (t: Task) => void;
  onMoveStatus: (id: string, status: TaskStatus) => void;
  onMoveUrgency: (
    id: string,
    urgency: TaskUrgency,
    priorityScore: number,
    extra?: Partial<Task>,
  ) => void;
  tasksById: Map<string, Task>;
  onError: (m: string) => void;
  onCreateForDate: (date: string) => void;
  onBulkPatchDueDate: (ids: string[], dueDate: string | null) => void;
}) {
  switch (view) {
    case "list":
      return (
        <TaskListView
          tasks={tasks}
          selected={selected}
          focusedId={focusedId}
          projects={projects}
          onOpen={onOpen}
          onToggleSelect={onToggleSelect}
          onPatch={onPatch}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      );
    case "table":
      return (
        <TaskTableView
          tasks={tasks}
          selected={selected}
          projects={projects}
          onOpen={onOpen}
          onToggleSelect={onToggleSelect}
          onPatch={onPatch}
        />
      );
    case "calendar":
      return (
        <TaskCalendarView
          tasks={tasks}
          onOpen={onOpen}
          onCreateForDate={onCreateForDate}
          onPatchDueDate={(id, dueDate) => onPatch(id, { due_date: dueDate })}
          onBulkPatchDueDate={onBulkPatchDueDate}
        />
      );
    case "status":
      return (
        <TaskStatusBoard
          tasks={tasks}
          onCardClick={onOpen}
          onMoveStatus={onMoveStatus}
        />
      );
    case "kanban":
      return (
        <TaskBoard
          tasks={tasks}
          onCardClick={onOpen}
          onMove={onMoveUrgency}
          onStatusChange={onMoveStatus}
        />
      );
    case "smart":
      return (
        <TaskSmart
          onCardClick={onOpen}
          onError={onError}
          tasksById={tasksById}
          onStatusChange={onMoveStatus}
        />
      );
    case "category":
      return (
        <TaskCategory
          tasks={tasks}
          onCardClick={onOpen}
          onStatusChange={onMoveStatus}
        />
      );
  }
}
