"use client";

import type { Task } from "@/lib/types/task";
import { Mono } from "@/components/dashboard/Mono";
import { UrgencyPill, pillToneFor } from "./UrgencyPill";

function dueLabel(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const [y, m, d] = dueDate.split("-").map(Number);
  const due = new Date(Date.UTC(y, m - 1, d));
  const today = new Date();
  const todayUTC = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const diffDays = Math.round((due.getTime() - todayUTC) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "due today";
  if (diffDays === 1) return "due tomorrow";
  if (diffDays === -1) return "due yesterday";
  if (diffDays > 0) return `due in ${diffDays}d`;
  return `${Math.abs(diffDays)}d overdue`;
}

function ownerInitials(owner: string | null): string {
  if (!owner) return "·";
  const parts = owner.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function TaskCard({
  task,
  onClick,
  dragging = false,
  compact = false,
  muted = false,
  subStats,
}: {
  task: Task;
  onClick?: () => void;
  dragging?: boolean;
  compact?: boolean;
  muted?: boolean;
  subStats?: { done: number; total: number } | null;
}) {
  const tone = pillToneFor(task);
  const due = dueLabel(task.due_date);
  const tags = (task.tags ?? []).slice(0, 2);
  const isCompleted = !!task.completed_at;
  const titleClass = isCompleted
    ? "text-ink-3 line-through"
    : muted
      ? "text-ink-3"
      : "text-ink-4";
  // D3 borderless treatment — surface contrast (ink-1 on ink-0) + hover bump
  // to ink-2 replaces the old hairline border. Dragging keeps the accent
  // tint so dnd-kit's ghost stays readable. Completed cards dim further
  // (opacity-60) so they sit visually under the open ones in the same
  // column when the SHOW COMPLETED toggle is on.
  const cardClass = muted
    ? "bg-ink-1/60 hover:bg-ink-2"
    : "bg-ink-1 hover:bg-ink-2";

  const isSubtask = !!task.parent_task_id;
  return (
    <div
      onClick={onClick}
      className={`group growth-in rounded-md px-4 py-3 flex flex-col gap-2 cursor-pointer transition-colors ${
        dragging
          ? "bg-ink-2 shadow-2xl shadow-glow-3/30 ring-1 ring-glow-2/60"
          : cardClass
      } ${compact ? "py-2" : ""} ${isSubtask ? "is-subtask" : ""} ${
        isCompleted ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`text-sm leading-snug min-w-0 break-words ${titleClass}`}>
          {task.title}
          {subStats && subStats.total > 0 && (
            <Mono className="ml-2 text-[10px] text-ink-3">
              {subStats.done}/{subStats.total}
            </Mono>
          )}
        </div>
        {isCompleted ? (
          <span className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-ok/40 bg-ok/15 text-ok shrink-0">
            COMPLETED
          </span>
        ) : (
          <UrgencyPill tone={tone} />
        )}
      </div>

      {(tags.length > 0 || task.entity_name || task.project_name || due) && (
        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
          <div className="flex items-center gap-1.5 min-w-0">
            {task.project_name && (
              <span
                className="px-1.5 py-0.5 rounded-md border border-accent/40 bg-accent/10 text-accent truncate max-w-[120px]"
                title={`Project: ${task.project_name}`}
              >
                ◆ {task.project_name}
              </span>
            )}
            {tags.map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded-md border border-ink-2 bg-ink-0/40 truncate max-w-[80px]"
              >
                {t}
              </span>
            ))}
            {task.entity_name && (
              <span className="truncate">· {task.entity_name}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {due && <Mono className="text-ink-3">{due}</Mono>}
            <span
              className="h-5 w-5 rounded-full bg-ink-2 border border-ink-2 flex items-center justify-center text-[9px] text-ink-3 shrink-0"
              title={task.owner ?? ""}
            >
              {ownerInitials(task.owner)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
