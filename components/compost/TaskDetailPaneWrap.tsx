"use client";

import type { Task, TaskDetail } from "@/lib/types/task";
import type { Project } from "@/lib/types/project";
import { TaskDetailPane } from "./TaskDetailPane";

export function TaskDetailPaneWrap({
  detail,
  detailLoading,
  projects,
  onClose,
  onPatch,
  onAddComment,
  onDeleteComment,
  onAddSubtask,
  onJumpToTask,
  onTogglePatch,
  onDelete,
  onConverted,
  onError,
}: {
  detail: TaskDetail;
  detailLoading: boolean;
  projects: Project[];
  onClose: () => void;
  onPatch: (patch: Partial<Task>) => void;
  onAddComment: (body: string) => Promise<void>;
  onDeleteComment: (id: string) => Promise<void>;
  onAddSubtask: (title: string) => Promise<void>;
  onJumpToTask: (id: string) => void;
  onTogglePatch: (id: string, patch: Partial<Task>) => void;
  onDelete: () => void;
  onConverted: (newKind: string, newId: string) => void;
  onError: (msg: string) => void;
}) {
  return (
    <TaskDetailPane
      key={detail.task.id}
      task={detail.task}
      comments={detail.comments}
      activity={detail.activity}
      subtasks={detail.subtasks}
      linkedCaptures={detail.linked_captures}
      projects={projects}
      onClose={onClose}
      onPatch={onPatch}
      onAddComment={onAddComment}
      onDeleteComment={onDeleteComment}
      onAddSubtask={onAddSubtask}
      onJumpToTask={onJumpToTask}
      onTogglePatch={onTogglePatch}
      onDelete={onDelete}
      onConverted={onConverted}
      onError={onError}
      loading={detailLoading}
    />
  );
}
